/**
 * FailingConfigRules — which specific AWS Config rules are non-compliant.
 *
 * Drills the Config compliance % into the actual failing rules + a sample of the
 * resources failing each, live from AWS Config. Collapsed by default (it can be a
 * long list); expands on click. Honest live badge + graceful states.
 *
 * Enhanced with:
 * - Remediation suggestions for common failing rules
 * - Priority badges (Critical/High/Medium/Low)
 * - Quick stats on auto-remediation vs manual intervention
 */
import { useEffect, useState } from 'react';
import { governPostureApi, type AwsConfigRuleDetail, type AwsFailingRule } from '../../api/client';
import { LiveDataBadge } from './DataSourceIndicator';

// ─────────────────────────── Remediation Configuration ───────────────────────────

type Priority = 'critical' | 'high' | 'medium' | 'low';

interface RemediationInfo {
  suggestion: string;
  steps: string[];
  priority: Priority;
  autoRemediable: boolean;
  awsDoc?: string;
}

/**
 * Maps common AWS Config rule patterns to remediation guidance.
 * Keys are patterns matched against rule_name or managed_rule (case-insensitive).
 */
const REMEDIATION_SUGGESTIONS: Record<string, RemediationInfo> = {
  'access-keys-rotated': {
    suggestion: 'Rotate IAM access keys older than 90 days',
    steps: [
      'Identify users with stale access keys in IAM console',
      'Generate new access keys for affected users',
      'Update applications with new credentials',
      'Disable and delete old access keys',
    ],
    priority: 'high',
    autoRemediable: false,
    awsDoc: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html',
  },
  's3-bucket-public-read-prohibited': {
    suggestion: 'Remove public read access from S3 buckets',
    steps: [
      'Navigate to S3 console and select the bucket',
      'Edit Block Public Access settings',
      'Enable "Block all public access"',
      'Review and remove any public bucket policies',
    ],
    priority: 'critical',
    autoRemediable: true,
    awsDoc: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html',
  },
  's3-bucket-public-write-prohibited': {
    suggestion: 'Remove public write access from S3 buckets',
    steps: [
      'Navigate to S3 console and select the bucket',
      'Edit Block Public Access settings',
      'Enable "Block all public access"',
      'Review and remove any public bucket policies',
    ],
    priority: 'critical',
    autoRemediable: true,
    awsDoc: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html',
  },
  'encrypted-volumes': {
    suggestion: 'Enable EBS encryption for volumes',
    steps: [
      'Create a snapshot of the unencrypted volume',
      'Copy the snapshot with encryption enabled',
      'Create a new volume from the encrypted snapshot',
      'Detach old volume and attach encrypted volume',
    ],
    priority: 'high',
    autoRemediable: false,
    awsDoc: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html',
  },
  'rds-storage-encrypted': {
    suggestion: 'Enable encryption for RDS instances',
    steps: [
      'Create a snapshot of the unencrypted RDS instance',
      'Copy the snapshot with encryption enabled',
      'Restore a new RDS instance from the encrypted snapshot',
      'Update application connection strings',
    ],
    priority: 'high',
    autoRemediable: false,
    awsDoc: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html',
  },
  'root-account-mfa-enabled': {
    suggestion: 'Enable MFA on the root account',
    steps: [
      'Sign in to AWS Console as root user',
      'Navigate to Security Credentials',
      'Under MFA, click "Assign MFA device"',
      'Follow wizard to register virtual or hardware MFA',
    ],
    priority: 'critical',
    autoRemediable: false,
    awsDoc: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user_mfa.html',
  },
  'iam-user-mfa-enabled': {
    suggestion: 'Enable MFA for IAM users with console access',
    steps: [
      'Navigate to IAM console and select the user',
      'Go to Security credentials tab',
      'Click "Manage" next to Assigned MFA device',
      'Follow wizard to assign virtual or hardware MFA',
    ],
    priority: 'high',
    autoRemediable: false,
    awsDoc: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_enable_virtual.html',
  },
  'cloudtrail-enabled': {
    suggestion: 'Enable CloudTrail logging in all regions',
    steps: [
      'Navigate to CloudTrail console',
      'Create a new trail or edit existing',
      'Enable "Apply to all regions"',
      'Configure S3 bucket for log storage',
    ],
    priority: 'critical',
    autoRemediable: true,
    awsDoc: 'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-create-a-trail-using-the-console-first-time.html',
  },
  'vpc-flow-logs-enabled': {
    suggestion: 'Enable VPC Flow Logs for network monitoring',
    steps: [
      'Navigate to VPC console and select the VPC',
      'Under Flow logs tab, click "Create flow log"',
      'Choose destination (CloudWatch Logs or S3)',
      'Select traffic type to capture (All, Accept, Reject)',
    ],
    priority: 'medium',
    autoRemediable: true,
    awsDoc: 'https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html',
  },
  'restricted-ssh': {
    suggestion: 'Restrict SSH access to specific IP ranges',
    steps: [
      'Navigate to EC2 Security Groups',
      'Identify groups with 0.0.0.0/0 on port 22',
      'Modify inbound rules to allow specific CIDR blocks',
      'Consider using AWS Systems Manager Session Manager instead',
    ],
    priority: 'critical',
    autoRemediable: true,
    awsDoc: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/authorizing-access-to-an-instance.html',
  },
  'restricted-rdp': {
    suggestion: 'Restrict RDP access to specific IP ranges',
    steps: [
      'Navigate to EC2 Security Groups',
      'Identify groups with 0.0.0.0/0 on port 3389',
      'Modify inbound rules to allow specific CIDR blocks',
      'Consider using AWS Systems Manager Fleet Manager instead',
    ],
    priority: 'critical',
    autoRemediable: true,
    awsDoc: 'https://docs.aws.amazon.com/AWSEC2/latest/WindowsGuide/authorizing-access-to-an-instance.html',
  },
  'iam-password-policy': {
    suggestion: 'Strengthen IAM password policy',
    steps: [
      'Navigate to IAM console > Account settings',
      'Click "Edit" on Password policy',
      'Enable minimum length (14+ chars), complexity requirements',
      'Set password expiration (90 days or less)',
    ],
    priority: 'medium',
    autoRemediable: true,
    awsDoc: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_passwords_account-policy.html',
  },
};

/**
 * Match a rule to remediation info by checking rule_name and managed_rule against known patterns.
 */
function getRemediationInfo(rule: AwsFailingRule): RemediationInfo | null {
  const ruleNameLower = rule.rule_name.toLowerCase();
  const managedRuleLower = (rule.managed_rule ?? '').toLowerCase();

  for (const [pattern, info] of Object.entries(REMEDIATION_SUGGESTIONS)) {
    if (ruleNameLower.includes(pattern) || managedRuleLower.includes(pattern)) {
      return info;
    }
  }
  return null;
}

/**
 * Infer priority for rules without specific remediation mapping based on resource types and count.
 */
function inferPriority(rule: AwsFailingRule): Priority {
  const resourceTypes = rule.resource_types.map(r => r.toLowerCase());
  // Critical: IAM, S3, Security Groups with high exposure
  if (resourceTypes.some(r => r.includes('iam') || r.includes('s3') || r.includes('securitygroup'))) {
    return rule.failing_resource_count > 5 ? 'critical' : 'high';
  }
  // High: RDS, EC2, Lambda
  if (resourceTypes.some(r => r.includes('rds') || r.includes('ec2') || r.includes('lambda'))) {
    return 'high';
  }
  // Medium: VPC, CloudWatch, etc.
  if (rule.failing_resource_count > 10) return 'medium';
  return 'low';
}

const PRIORITY_CONFIG: Record<Priority, { label: string; bgClass: string; textClass: string }> = {
  critical: { label: 'Critical', bgClass: 'bg-rose-100', textClass: 'text-rose-700' },
  high: { label: 'High', bgClass: 'bg-orange-100', textClass: 'text-orange-700' },
  medium: { label: 'Medium', bgClass: 'bg-amber-100', textClass: 'text-amber-700' },
  low: { label: 'Low', bgClass: 'bg-slate-100', textClass: 'text-slate-600' },
};

// ─────────────────────────── Remediation Detail Modal ───────────────────────────

interface RemediationModalProps {
  rule: AwsFailingRule;
  remediation: RemediationInfo;
  onClose: () => void;
}

function RemediationModal({ rule, remediation, onClose }: RemediationModalProps) {
  const priorityConfig = PRIORITY_CONFIG[remediation.priority];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${priorityConfig.bgClass} ${priorityConfig.textClass}`}>
                {priorityConfig.label}
              </span>
              {remediation.autoRemediable && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                  Auto-Remediable
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-slate-900 truncate" title={rule.rule_name}>
              {rule.rule_name}
            </h3>
            {rule.description && (
              <p className="text-xs text-slate-500 mt-0.5">{rule.description}</p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Suggested Action */}
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Suggested Action</div>
            <div className="text-sm text-blue-800 font-medium">{remediation.suggestion}</div>
          </div>

          {/* Remediation Steps */}
          <div>
            <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-2">Remediation Steps</div>
            <ol className="space-y-2">
              {remediation.steps.map((step, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-sm text-slate-700">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Affected Resources */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Affected Resources</div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-rose-600 tabular-nums">{rule.failing_resource_count}</span>
              <span className="text-sm text-slate-600">
                {rule.resource_types.length > 0 ? rule.resource_types.join(', ') : 'resources'}
              </span>
            </div>
          </div>

          {/* AWS Documentation Link */}
          {remediation.awsDoc && (
            <a
              href={remediation.awsDoc}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 hover:underline"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              AWS Documentation
            </a>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="w-full py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Quick Stats Component ───────────────────────────

interface QuickStatsProps {
  rules: AwsFailingRule[];
}

function QuickStats({ rules }: QuickStatsProps) {
  const stats = rules.reduce(
    (acc, rule) => {
      const remediation = getRemediationInfo(rule);
      if (remediation?.autoRemediable) {
        acc.autoRemediable++;
      } else {
        acc.manualIntervention++;
      }
      const priority = remediation?.priority ?? inferPriority(rule);
      acc.byPriority[priority]++;
      return acc;
    },
    { autoRemediable: 0, manualIntervention: 0, byPriority: { critical: 0, high: 0, medium: 0, low: 0 } }
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 pt-3">
      <div className="px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
        <div className="text-[10px] text-emerald-600 font-medium uppercase tracking-wide">Auto-Remediable</div>
        <div className="text-lg font-bold text-emerald-700 tabular-nums">{stats.autoRemediable}</div>
      </div>
      <div className="px-3 py-2 bg-amber-50 rounded-lg border border-amber-100">
        <div className="text-[10px] text-amber-600 font-medium uppercase tracking-wide">Manual Required</div>
        <div className="text-lg font-bold text-amber-700 tabular-nums">{stats.manualIntervention}</div>
      </div>
      <div className="px-3 py-2 bg-rose-50 rounded-lg border border-rose-100">
        <div className="text-[10px] text-rose-600 font-medium uppercase tracking-wide">Critical/High</div>
        <div className="text-lg font-bold text-rose-700 tabular-nums">{stats.byPriority.critical + stats.byPriority.high}</div>
      </div>
      <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
        <div className="text-[10px] text-slate-600 font-medium uppercase tracking-wide">Medium/Low</div>
        <div className="text-lg font-bold text-slate-700 tabular-nums">{stats.byPriority.medium + stats.byPriority.low}</div>
      </div>
    </div>
  );
}

// ─────────────────────────── Main Component ───────────────────────────

export default function FailingConfigRules() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AwsConfigRuleDetail | null>(null);
  const [selectedRule, setSelectedRule] = useState<{ rule: AwsFailingRule; remediation: RemediationInfo } | null>(null);

  // Lazy-load only when expanded (the detail pull is heavier than the count).
  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    setLoading(true);
    governPostureApi.configRuleDetail()
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, data]);

  const rules = data?.failing_rules ?? [];

  const handleFixClick = (rule: AwsFailingRule) => {
    const remediation = getRemediationInfo(rule);
    if (remediation) {
      setSelectedRule({ rule, remediation });
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-slate-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-5 py-3 text-left hover:bg-slate-50/60 transition-colors"
      >
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        <h3 className="text-sm font-semibold text-slate-900">Failing Config Rules</h3>
        {data?.live && <LiveDataBadge />}
        <span className="text-[11px] text-slate-400">which AWS Config rules are non-compliant</span>
        {data && <span className="ml-auto text-[11px] font-semibold text-rose-600 tabular-nums">{data.total_failing} failing</span>}
        {!data && !loading && <span className="ml-auto text-[11px] text-slate-400">show detail →</span>}
      </button>

      {open && (
        <div className="px-5 pb-4 border-t border-slate-100">
          {loading ? (
            <div className="h-16 flex items-center justify-center text-xs text-slate-400">Loading from AWS Config...</div>
          ) : data?.live && rules.length > 0 ? (
            <>
              {/* Quick Stats */}
              <QuickStats rules={rules} />

              <div className="overflow-x-auto mt-3">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-slate-400 text-[10px] uppercase tracking-wide text-left">
                      <th scope="col" className="font-medium pb-2">Rule</th>
                      <th scope="col" className="font-medium pb-2">Priority</th>
                      <th scope="col" className="font-medium pb-2">Failing resources</th>
                      <th scope="col" className="font-medium pb-2">Suggested Action</th>
                      <th scope="col" className="font-medium pb-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map(r => {
                      const remediation = getRemediationInfo(r);
                      const priority = remediation?.priority ?? inferPriority(r);
                      const priorityConfig = PRIORITY_CONFIG[priority];

                      return (
                        <tr key={r.rule_name} className="border-t border-slate-100 hover:bg-slate-50/50">
                          <td className="py-2 pr-2">
                            <div className="font-medium text-slate-800 truncate max-w-[200px]" title={r.rule_name}>{r.rule_name}</div>
                            {r.description && <div className="text-[10px] text-slate-500 truncate max-w-[200px]" title={r.description}>{r.description}</div>}
                            {r.managed_rule && <div className="text-[9px] text-slate-400 font-mono truncate max-w-[200px]" title={r.managed_rule}>{r.managed_rule}</div>}
                          </td>
                          <td className="py-2 pr-2">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${priorityConfig.bgClass} ${priorityConfig.textClass}`}>
                              {priorityConfig.label}
                            </span>
                          </td>
                          <td className="py-2 pr-2 text-slate-600">
                            <span className="font-semibold text-rose-600 tabular-nums">{r.failing_resource_count}</span>
                            {r.resource_types.length > 0 && <span className="text-[10px] text-slate-400 ml-1.5 truncate max-w-[100px] inline-block align-bottom">{r.resource_types.join(', ')}</span>}
                          </td>
                          <td className="py-2 pr-2">
                            {remediation ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-slate-600 truncate max-w-[180px]" title={remediation.suggestion}>
                                  {remediation.suggestion}
                                </span>
                                {remediation.autoRemediable && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 whitespace-nowrap">
                                    auto
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">Review rule configuration</span>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            {remediation ? (
                              <button
                                onClick={() => handleFixClick(r)}
                                className="px-2.5 py-1 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                              >
                                Fix
                              </button>
                            ) : (
                              <a
                                href={`https://console.aws.amazon.com/config/home#/rules/rule-details/${encodeURIComponent(r.rule_name)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1 text-[10px] font-medium rounded bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors inline-block"
                              >
                                View
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {data.note && <div className="text-[11px] text-slate-400 mt-2">{data.note}</div>}
            </>
          ) : (
            <div className="flex items-start gap-2 text-[12px] text-slate-500 bg-slate-50 rounded-lg px-4 py-3 mt-3">
              <span className="text-amber-500 mt-0.5">*</span>
              <div>
                <div className="font-medium text-slate-600">{data?.live ? 'No failing Config rules' : 'Config detail unavailable'}</div>
                <div className="text-[11px] mt-0.5">{data?.note ?? 'Every evaluated AWS Config rule is compliant, or the detail API is not permitted.'}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Remediation Modal */}
      {selectedRule && (
        <RemediationModal
          rule={selectedRule.rule}
          remediation={selectedRule.remediation}
          onClose={() => setSelectedRule(null)}
        />
      )}
    </div>
  );
}
