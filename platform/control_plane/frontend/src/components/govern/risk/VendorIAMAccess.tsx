/**
 * VendorIAMAccess - IAM access summary for a vendor
 *
 * Shows what AWS IAM permissions a vendor integration has:
 * - IAM roles and their trust policies
 * - Attached policies and key permissions
 * - Risk indicators and recommendations
 *
 * For external SaaS vendors (OpenAI, Copilot, etc.) displays
 * a message indicating no direct AWS access.
 */

import { useState, useEffect } from 'react';
import { Icon } from '../icons';
import { governIamApi, type VendorIAMAccess as VendorIAMAccessData } from '../../../api/client';

interface VendorIAMAccessProps {
  vendorId: string;
  vendorName: string;
}

const riskColors: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  unknown: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
};

function formatLastUsed(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function VendorIAMAccess({ vendorId }: VendorIAMAccessProps) {
  const [data, setData] = useState<VendorIAMAccessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const result = await governIamApi.vendorAccess(vendorId);
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load IAM data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (loading) {
    return (
      <div className="border border-slate-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Icon name="key" className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">AWS IAM Access</span>
        </div>
        <div className="mt-3 flex items-center justify-center py-4">
          <div className="animate-spin h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-rose-200 rounded-lg p-4 bg-rose-50">
        <div className="flex items-center gap-2">
          <Icon name="exclamation-triangle" className="w-4 h-4 text-rose-500" />
          <span className="text-sm font-medium text-rose-700">IAM Access Error</span>
        </div>
        <p className="text-xs text-rose-600 mt-2">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  // For vendors with no direct AWS IAM access, show a summary. This branch is
  // reached both for live results (IAM was queried, no matching roles found) and
  // the not-live illustrative sample — so it surfaces the honest note and the
  // Live/Mock source indicator, and flips to the Live badge automatically.
  if (!data.has_aws_access) {
    return (
      <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="key" className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">AWS IAM Access</span>
        </div>
        <div className="flex items-start gap-2 text-xs text-slate-500">
          <Icon name="shield-check" className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <span>{data.note || 'No direct AWS IAM access found for this vendor'}</span>
        </div>
        {data.recommendations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <div className="text-[10px] font-medium text-slate-500 mb-1">Recommendations</div>
            <ul className="space-y-1">
              {data.recommendations.map((rec, idx) => (
                <li key={idx} className="text-[10px] text-slate-600 flex items-start gap-1.5">
                  <Icon name="light-bulb" className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Source indicator - flips to Live once real IAM data is fetched */}
        <div className="mt-3 pt-2 border-t border-slate-200 flex items-center gap-2 text-[10px] text-slate-400">
          <span className={`w-2 h-2 rounded-full ${data.live ? 'bg-emerald-400' : 'bg-slate-300'}`} />
          {data.live ? 'Live' : 'Mock'} - {data.source}
        </div>
      </div>
    );
  }

  const riskStyle = riskColors[data.risk_level] || riskColors.unknown;

  return (
    <div className={`border rounded-lg overflow-hidden ${riskStyle.border}`}>
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full px-4 py-3 flex items-center justify-between ${riskStyle.bg} hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          <Icon name="key" className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-800">AWS IAM Access</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize ${riskStyle.bg} ${riskStyle.text} border ${riskStyle.border}`}>
            {data.risk_level} risk
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-slate-600">
              {data.roles.length} role{data.roles.length !== 1 ? 's' : ''} - {data.total_permissions} permissions
            </div>
          </div>
          <Icon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            className="w-4 h-4 text-slate-400"
          />
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="p-4 bg-white space-y-4">
          {/* Last Activity */}
          {data.last_activity && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Icon name="clock" className="w-3.5 h-3.5" />
              Last activity: {formatLastUsed(data.last_activity)}
            </div>
          )}

          {/* Roles */}
          {data.roles.length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">IAM Roles</div>
              <div className="space-y-2">
                {data.roles.map((role, idx) => (
                  <div key={idx} className="bg-slate-50 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate" title={role.arn}>
                          {role.name}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 truncate" title={role.arn}>
                          {role.arn}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-[10px] text-slate-500">Last used</div>
                        <div className="text-xs font-medium text-slate-700">
                          {formatLastUsed(role.last_used)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-600 bg-white/60 rounded px-2 py-1">
                      {role.trust_policy_summary}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Policies */}
          {data.policies.length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">Attached Policies</div>
              <div className="space-y-2">
                {data.policies.map((policy, idx) => (
                  <div key={idx} className="bg-slate-50 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">{policy.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                          policy.policy_type === 'managed'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}>
                          {policy.policy_type}
                        </span>
                      </div>
                    </div>
                    {policy.permissions.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {policy.permissions.slice(0, 5).map((perm, pIdx) => (
                          <span
                            key={pIdx}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                              data.sensitive_permissions.includes(perm)
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {perm}
                          </span>
                        ))}
                        {policy.permissions.length > 5 && (
                          <span className="px-1.5 py-0.5 text-[10px] text-slate-500">
                            +{policy.permissions.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-2 text-[10px] text-slate-500">
                      Scope: {policy.resource_scope}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sensitive Permissions Warning */}
          {data.sensitive_permissions.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Icon name="exclamation-triangle" className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-medium text-amber-800">Sensitive Permissions</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {data.sensitive_permissions.map((perm, idx) => (
                  <span key={idx} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-mono">
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                <Icon name="light-bulb" className="w-4 h-4 text-amber-500" />
                Recommendations
              </div>
              <ul className="space-y-1.5">
                {data.recommendations.map((rec, idx) => (
                  <li key={idx} className="text-xs text-slate-600 flex items-start gap-2">
                    <Icon name="chevron-right" className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Source indicator */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className={`w-2 h-2 rounded-full ${data.live ? 'bg-emerald-400' : 'bg-slate-300'}`} />
              {data.live ? 'Live' : 'Mock'} - {data.source}
            </div>
            {data.note && (
              <span className="text-[10px] text-slate-400">{data.note}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
