/**
 * VendorActivityLog - Audit trail timeline for a vendor
 *
 * Displays activity history including assessments, status changes, TPIA updates,
 * DDQ events, findings, contract events, alerts, and approval decisions.
 */

import { useState, useMemo } from 'react';
import { Icon, type IconName } from '../icons';

type ActivityType =
  | 'assessment-completed'
  | 'status-changed'
  | 'tpia-updated'
  | 'ddq-sent'
  | 'ddq-received'
  | 'ddq-completed'
  | 'finding-opened'
  | 'finding-closed'
  | 'contract-renewed'
  | 'contract-expiring'
  | 'alert-triggered'
  | 'approval-decision';

type DateRange = '7d' | '30d' | '90d' | '1y' | 'all';

interface ActivityDetail {
  label: string;
  oldValue?: string;
  newValue?: string;
  score?: number;
}

interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  user: string;
  timestamp: string;
  details?: ActivityDetail[];
}

interface VendorActivityLogProps {
  vendorId: string;
}

const activityConfig: Record<ActivityType, { icon: IconName; color: string; bgColor: string }> = {
  'assessment-completed': {
    icon: 'chart-bar',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  'status-changed': {
    icon: 'arrow-path',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  'tpia-updated': {
    icon: 'clipboard',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  'ddq-sent': {
    icon: 'document',
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
  },
  'ddq-received': {
    icon: 'document',
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
  },
  'ddq-completed': {
    icon: 'document-check',
    color: 'text-slate-700',
    bgColor: 'bg-slate-200',
  },
  'finding-opened': {
    icon: 'exclamation-triangle',
    color: 'text-rose-600',
    bgColor: 'bg-rose-100',
  },
  'finding-closed': {
    icon: 'check-circle',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
  },
  'contract-renewed': {
    icon: 'calendar',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
  },
  'contract-expiring': {
    icon: 'calendar',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
  },
  'alert-triggered': {
    icon: 'bell-alert',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  'approval-decision': {
    icon: 'shield-check',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
  },
};

// Override colors for status-changed based on target status
function getStatusChangeColors(description: string): { color: string; bgColor: string } {
  if (description.toLowerCase().includes('approved')) {
    return { color: 'text-emerald-600', bgColor: 'bg-emerald-100' };
  }
  if (description.toLowerCase().includes('blocked')) {
    return { color: 'text-rose-600', bgColor: 'bg-rose-100' };
  }
  return { color: 'text-amber-600', bgColor: 'bg-amber-100' };
}

// Generate realistic mock activity data based on vendorId
function generateMockActivities(vendorId: string): Activity[] {
  const hash = vendorId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const activities: Activity[] = [];
  const now = new Date('2026-08-06');

  // Use vendor-specific patterns
  const vendorPatterns: Record<string, {
    recentAssessment: boolean;
    statusHistory: Array<{ from: string; to: string; daysAgo: number }>;
    hasFindings: boolean;
    ddqComplete: boolean;
  }> = {
    anthropic: {
      recentAssessment: true,
      statusHistory: [
        { from: 'under-review', to: 'approved', daysAgo: 143 },
      ],
      hasFindings: true,
      ddqComplete: true,
    },
    'aws-bedrock': {
      recentAssessment: true,
      statusHistory: [
        { from: 'conditional', to: 'approved', daysAgo: 127 },
      ],
      hasFindings: false,
      ddqComplete: true,
    },
    openai: {
      recentAssessment: true,
      statusHistory: [
        { from: 'approved', to: 'conditional', daysAgo: 45 },
        { from: 'under-review', to: 'approved', daysAgo: 180 },
      ],
      hasFindings: true,
      ddqComplete: false,
    },
    cursor: {
      recentAssessment: false,
      statusHistory: [
        { from: 'conditional', to: 'under-review', daysAgo: 30 },
      ],
      hasFindings: true,
      ddqComplete: false,
    },
    'github-copilot': {
      recentAssessment: true,
      statusHistory: [
        { from: 'under-review', to: 'approved', daysAgo: 157 },
      ],
      hasFindings: true,
      ddqComplete: true,
    },
    cohere: {
      recentAssessment: false,
      statusHistory: [
        { from: 'conditional', to: 'blocked', daysAgo: 60 },
        { from: 'approved', to: 'conditional', daysAgo: 120 },
      ],
      hasFindings: true,
      ddqComplete: false,
    },
  };

  const pattern = vendorPatterns[vendorId] || {
    recentAssessment: hash % 2 === 0,
    statusHistory: [],
    hasFindings: hash % 3 === 0,
    ddqComplete: hash % 4 === 0,
  };

  let id = 1;

  // Add assessment activities
  if (pattern.recentAssessment) {
    const assessmentDate = new Date(now);
    assessmentDate.setDate(assessmentDate.getDate() - (30 + (hash % 60)));
    activities.push({
      id: `${vendorId}-${id++}`,
      type: 'assessment-completed',
      title: '5-Domain Risk Assessment Completed',
      description: 'Annual vendor risk assessment completed across all five domains.',
      user: 'Sarah Chen',
      timestamp: assessmentDate.toISOString(),
      details: [
        { label: 'Financial Risk', score: 25 + (hash % 30) },
        { label: 'Operational Risk', score: 30 + (hash % 25) },
        { label: 'Compliance Risk', score: 28 + (hash % 35) },
        { label: 'Reputation Risk', score: 20 + (hash % 20) },
        { label: 'Cyber Risk', score: 35 + (hash % 30) },
      ],
    });
  }

  // Add status change activities
  pattern.statusHistory.forEach(change => {
    const changeDate = new Date(now);
    changeDate.setDate(changeDate.getDate() - change.daysAgo);
    activities.push({
      id: `${vendorId}-${id++}`,
      type: 'status-changed',
      title: 'Vendor Status Changed',
      description: `Status changed from ${change.from} to ${change.to}.`,
      user: 'Risk Committee',
      timestamp: changeDate.toISOString(),
      details: [
        { label: 'Previous Status', oldValue: change.from },
        { label: 'New Status', newValue: change.to },
      ],
    });
  });

  // Add TPIA update
  const tpiaDate = new Date(now);
  tpiaDate.setDate(tpiaDate.getDate() - (60 + (hash % 90)));
  activities.push({
    id: `${vendorId}-${id++}`,
    type: 'tpia-updated',
    title: 'TPIA Assessment Updated',
    description: 'Third-Party Inherent Assessment questionnaire refreshed.',
    user: 'Michael Torres',
    timestamp: tpiaDate.toISOString(),
    details: [
      { label: 'Data Access Level', oldValue: 'internal', newValue: 'confidential' },
      { label: 'Inherent Risk', oldValue: 'moderate', newValue: 'higher' },
    ],
  });

  // Add DDQ activities
  if (pattern.ddqComplete) {
    const ddqCompleteDate = new Date(now);
    ddqCompleteDate.setDate(ddqCompleteDate.getDate() - (45 + (hash % 30)));
    activities.push({
      id: `${vendorId}-${id++}`,
      type: 'ddq-completed',
      title: 'DDQ Response Reviewed',
      description: 'Due diligence questionnaire reviewed and accepted.',
      user: 'Jennifer Walsh',
      timestamp: ddqCompleteDate.toISOString(),
    });

    const ddqReceivedDate = new Date(ddqCompleteDate);
    ddqReceivedDate.setDate(ddqReceivedDate.getDate() - 7);
    activities.push({
      id: `${vendorId}-${id++}`,
      type: 'ddq-received',
      title: 'DDQ Response Received',
      description: 'Vendor submitted completed questionnaire.',
      user: 'System',
      timestamp: ddqReceivedDate.toISOString(),
    });

    const ddqSentDate = new Date(ddqReceivedDate);
    ddqSentDate.setDate(ddqSentDate.getDate() - 14);
    activities.push({
      id: `${vendorId}-${id++}`,
      type: 'ddq-sent',
      title: 'DDQ Questionnaire Sent',
      description: 'Annual due diligence questionnaire sent to vendor.',
      user: 'Sarah Chen',
      timestamp: ddqSentDate.toISOString(),
    });
  } else {
    const ddqSentDate = new Date(now);
    ddqSentDate.setDate(ddqSentDate.getDate() - (20 + (hash % 40)));
    activities.push({
      id: `${vendorId}-${id++}`,
      type: 'ddq-sent',
      title: 'DDQ Questionnaire Sent',
      description: 'Annual due diligence questionnaire sent to vendor.',
      user: 'Sarah Chen',
      timestamp: ddqSentDate.toISOString(),
    });
  }

  // Add finding activities
  if (pattern.hasFindings) {
    const findingOpenDate = new Date(now);
    findingOpenDate.setDate(findingOpenDate.getDate() - (15 + (hash % 45)));
    activities.push({
      id: `${vendorId}-${id++}`,
      type: 'finding-opened',
      title: 'Security Finding Opened',
      description: 'Data encryption gap identified in vendor API responses.',
      user: 'Security Team',
      timestamp: findingOpenDate.toISOString(),
      details: [
        { label: 'Severity', newValue: 'Medium' },
        { label: 'Category', newValue: 'Data Protection' },
      ],
    });

    if (hash % 2 === 0) {
      const findingCloseDate = new Date(now);
      findingCloseDate.setDate(findingCloseDate.getDate() - (5 + (hash % 10)));
      activities.push({
        id: `${vendorId}-${id++}`,
        type: 'finding-closed',
        title: 'Finding Remediated',
        description: 'Vendor implemented TLS 1.3 for all API endpoints.',
        user: 'Michael Torres',
        timestamp: findingCloseDate.toISOString(),
      });
    }
  }

  // Add contract event
  const contractDate = new Date(now);
  contractDate.setDate(contractDate.getDate() - (90 + (hash % 180)));
  activities.push({
    id: `${vendorId}-${id++}`,
    type: 'contract-renewed',
    title: 'Contract Renewed',
    description: 'Annual service agreement renewed with updated terms.',
    user: 'Legal Team',
    timestamp: contractDate.toISOString(),
    details: [
      { label: 'Term', newValue: '12 months' },
      { label: 'SLA', newValue: '99.9% uptime' },
    ],
  });

  // Add alert if vendor has issues
  if (pattern.hasFindings && hash % 3 === 0) {
    const alertDate = new Date(now);
    alertDate.setDate(alertDate.getDate() - (3 + (hash % 7)));
    activities.push({
      id: `${vendorId}-${id++}`,
      type: 'alert-triggered',
      title: 'Risk Alert Triggered',
      description: 'Vendor risk score exceeded threshold (>50).',
      user: 'System',
      timestamp: alertDate.toISOString(),
    });
  }

  // Add approval decision for approved vendors
  if (pattern.statusHistory.some(s => s.to === 'approved')) {
    const approvalDate = new Date(now);
    const approvalDays = pattern.statusHistory.find(s => s.to === 'approved')?.daysAgo || 100;
    approvalDate.setDate(approvalDate.getDate() - approvalDays);
    activities.push({
      id: `${vendorId}-${id++}`,
      type: 'approval-decision',
      title: 'Approval Granted',
      description: 'Vendor approved for production use after risk committee review.',
      user: 'Risk Committee',
      timestamp: approvalDate.toISOString(),
    });
  }

  // Sort by timestamp descending
  return activities.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date('2026-08-06');
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function filterByDateRange(activities: Activity[], range: DateRange): Activity[] {
  if (range === 'all') return activities;

  const now = new Date('2026-08-06');
  const days = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[range];
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);

  return activities.filter(a => new Date(a.timestamp) >= cutoff);
}

export default function VendorActivityLog({ vendorId }: VendorActivityLogProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<ActivityType>>(new Set());
  const [dateRange, setDateRange] = useState<DateRange>('90d');

  const allActivities = useMemo(() => generateMockActivities(vendorId), [vendorId]);

  const filteredActivities = useMemo(() => {
    let result = filterByDateRange(allActivities, dateRange);
    if (selectedTypes.size > 0) {
      result = result.filter(a => selectedTypes.has(a.type));
    }
    return result;
  }, [allActivities, dateRange, selectedTypes]);

  // Stats
  const stats = useMemo(() => {
    const assessments = allActivities.filter(a => a.type === 'assessment-completed').length;
    const statusChanges = allActivities.filter(a => a.type === 'status-changed').length;
    const assessmentDates = allActivities
      .filter(a => a.type === 'assessment-completed')
      .map(a => new Date(a.timestamp).getTime())
      .sort((a, b) => b - a);

    let avgDaysBetween = 0;
    if (assessmentDates.length > 1) {
      const diffs = assessmentDates.slice(0, -1).map((d, i) => d - assessmentDates[i + 1]);
      avgDaysBetween = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length / (1000 * 60 * 60 * 24));
    }

    return {
      total: allActivities.length,
      assessments,
      statusChanges,
      avgDaysBetween: avgDaysBetween || 180, // Default to 180 if only one assessment
    };
  }, [allActivities]);

  const activityTypeLabels: Record<ActivityType, string> = {
    'assessment-completed': 'Assessments',
    'status-changed': 'Status Changes',
    'tpia-updated': 'TPIA Updates',
    'ddq-sent': 'DDQ Sent',
    'ddq-received': 'DDQ Received',
    'ddq-completed': 'DDQ Completed',
    'finding-opened': 'Findings Opened',
    'finding-closed': 'Findings Closed',
    'contract-renewed': 'Contract Renewed',
    'contract-expiring': 'Contract Expiring',
    'alert-triggered': 'Alerts',
    'approval-decision': 'Approvals',
  };

  const toggleType = (type: ActivityType) => {
    const newSet = new Set(selectedTypes);
    if (newSet.has(type)) {
      newSet.delete(type);
    } else {
      newSet.add(type);
    }
    setSelectedTypes(newSet);
  };

  const availableTypes = useMemo(() => {
    const types = new Set<ActivityType>();
    allActivities.forEach(a => types.add(a.type));
    return Array.from(types);
  }, [allActivities]);

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-lg font-semibold text-slate-900">{stats.total}</div>
          <div className="text-[10px] text-slate-500">Total Activities</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-lg font-semibold text-blue-700">{stats.assessments}</div>
          <div className="text-[10px] text-slate-500">Assessments</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-3 text-center">
          <div className="text-lg font-semibold text-amber-700">{stats.statusChanges}</div>
          <div className="text-[10px] text-slate-500">Status Changes</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <div className="text-lg font-semibold text-purple-700">{stats.avgDaysBetween}d</div>
          <div className="text-[10px] text-slate-500">Avg Between Assess.</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Period:</span>
          <select
            aria-label="Filter by date range"
            value={dateRange}
            onChange={e => setDateRange(e.target.value as DateRange)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
            <option value="all">All time</option>
          </select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">Type:</span>
          {availableTypes.map(type => {
            const config = activityConfig[type];
            const isSelected = selectedTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                  isSelected
                    ? `${config.bgColor} ${config.color} border-transparent`
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {activityTypeLabels[type]}
              </button>
            );
          })}
          {selectedTypes.size > 0 && (
            <button
              onClick={() => setSelectedTypes(new Set())}
              className="text-[10px] text-slate-500 hover:text-slate-700 underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />

        <div className="space-y-3">
          {filteredActivities.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500">
              No activities found for the selected filters.
            </div>
          ) : (
            filteredActivities.map(activity => {
              const isExpanded = expandedId === activity.id;
              const config = activity.type === 'status-changed'
                ? { ...activityConfig[activity.type], ...getStatusChangeColors(activity.description) }
                : activityConfig[activity.type];

              return (
                <div key={activity.id} className="relative pl-10">
                  {/* Icon on timeline */}
                  <div
                    className={`absolute left-0 w-8 h-8 rounded-full flex items-center justify-center ${config.bgColor}`}
                  >
                    <Icon name={config.icon} className={`w-4 h-4 ${config.color}`} />
                  </div>

                  {/* Activity card */}
                  <div
                    className={`bg-white border rounded-lg transition-shadow ${
                      activity.details ? 'cursor-pointer hover:shadow-sm' : ''
                    } ${isExpanded ? 'border-slate-300 shadow-sm' : 'border-slate-200'}`}
                    onClick={() => activity.details && setExpandedId(isExpanded ? null : activity.id)}
                  >
                    <div className="px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-900">{activity.title}</span>
                            {activity.details && (
                              <Icon
                                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                className="w-3 h-3 text-slate-400"
                              />
                            )}
                          </div>
                          <p className="text-[10px] text-slate-600 mt-0.5">{activity.description}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-[10px] text-slate-500">{formatTimestamp(activity.timestamp)}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{activity.user}</div>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && activity.details && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <div className="grid grid-cols-2 gap-2">
                            {activity.details.map((detail, idx) => (
                              <div key={idx} className="bg-slate-50 rounded px-2 py-1.5">
                                <div className="text-[10px] text-slate-500">{detail.label}</div>
                                {detail.score !== undefined ? (
                                  <div className={`text-xs font-medium ${
                                    detail.score <= 30 ? 'text-emerald-600' :
                                    detail.score <= 50 ? 'text-amber-600' :
                                    detail.score <= 70 ? 'text-orange-600' :
                                    'text-rose-600'
                                  }`}>
                                    {detail.score}
                                  </div>
                                ) : detail.oldValue && detail.newValue ? (
                                  <div className="flex items-center gap-1 text-xs">
                                    <span className="text-slate-500 line-through">{detail.oldValue}</span>
                                    <Icon name="arrow-right" className="w-3 h-3 text-slate-400" />
                                    <span className="text-slate-900 font-medium">{detail.newValue}</span>
                                  </div>
                                ) : (
                                  <div className="text-xs font-medium text-slate-900">
                                    {detail.newValue || detail.oldValue}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 text-[10px] text-slate-400">
                            {formatDate(activity.timestamp)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {filteredActivities.length > 0 && (
        <div className="text-center text-[10px] text-slate-400">
          Showing {filteredActivities.length} of {allActivities.length} activities
        </div>
      )}
    </div>
  );
}
