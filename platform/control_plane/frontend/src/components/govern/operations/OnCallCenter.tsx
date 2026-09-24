/**
 * OnCallCenter - On-call rotation and escalation management center for AI operations.
 *
 * Provides:
 * - Current on-call panel with primary/secondary/escalation chain
 * - Weekly schedule view with color-coded rotations
 * - Escalation policy management with create/edit modal
 * - Notification channel integrations (PagerDuty, OpsGenie, Slack, SMS, Email)
 * - On-call history with response time analytics
 * - Statistics: avg response time, pages per shift, escalation rate
 *
 * FSI-appropriate escalation policies for AI agent incidents.
 */

import { useState, useMemo } from 'react';
import { Icon, type IconName } from '../icons';
import StatCard from '../StatCard';
import { MockDataBadge, LiveDataBadge } from '../DataSourceIndicator';
import { useOnCall, useEscalationPolicies } from './useOpsLiveData';

// ============================================================================
// Types
// ============================================================================

interface OnCallPerson {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  slack: string;
  photoPlaceholder: string; // Initials for avatar
  team: string;
}

interface OnCallShift {
  id: string;
  personId: string;
  type: 'primary' | 'secondary';
  startTime: Date;
  endTime: Date;
}

interface EscalationTier {
  tier: number;
  name: string;
  contactMethod: string;
  delayMinutes: number;
}

interface EscalationPolicy {
  id: string;
  name: string;
  description: string;
  triggerConditions: string[];
  tiers: EscalationTier[];
  notificationChannels: string[];
  enabled: boolean;
}

interface NotificationChannel {
  id: string;
  type: 'pagerduty' | 'opsgenie' | 'slack' | 'sms' | 'email';
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  config: string;
  lastTest?: Date;
}

interface OnCallHistoryEntry {
  id: string;
  personId: string;
  shiftStart: Date;
  shiftEnd: Date;
  pagesReceived: number;
  avgResponseTime: number; // seconds
  escalations: number;
  incidents: number;
}

type TabId = 'current' | 'schedule' | 'policies' | 'channels' | 'history' | 'stats';

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_TEAM: OnCallPerson[] = [
  {
    id: 'person-1',
    name: 'Sarah Chen',
    role: 'Senior SRE',
    email: 'sarah.chen@fsi-bank.com',
    phone: '+1 (555) 123-4567',
    slack: '@sarah.chen',
    photoPlaceholder: 'SC',
    team: 'AI Platform',
  },
  {
    id: 'person-2',
    name: 'Mike Torres',
    role: 'Platform Engineer',
    email: 'mike.torres@fsi-bank.com',
    phone: '+1 (555) 234-5678',
    slack: '@mike.torres',
    photoPlaceholder: 'MT',
    team: 'AI Platform',
  },
  {
    id: 'person-3',
    name: 'Priya Sharma',
    role: 'AI Ops Lead',
    email: 'priya.sharma@fsi-bank.com',
    phone: '+1 (555) 345-6789',
    slack: '@priya.sharma',
    photoPlaceholder: 'PS',
    team: 'AI Platform',
  },
  {
    id: 'person-4',
    name: 'James Wilson',
    role: 'DevOps Manager',
    email: 'james.wilson@fsi-bank.com',
    phone: '+1 (555) 456-7890',
    slack: '@james.wilson',
    photoPlaceholder: 'JW',
    team: 'Platform',
  },
  {
    id: 'person-5',
    name: 'Lisa Park',
    role: 'AI Safety Engineer',
    email: 'lisa.park@fsi-bank.com',
    phone: '+1 (555) 567-8901',
    slack: '@lisa.park',
    photoPlaceholder: 'LP',
    team: 'AI Safety',
  },
  {
    id: 'person-6',
    name: 'David Kim',
    role: 'On-Call Manager',
    email: 'david.kim@fsi-bank.com',
    phone: '+1 (555) 678-9012',
    slack: '@david.kim',
    photoPlaceholder: 'DK',
    team: 'Operations',
  },
];

// Current shift ends in 4 hours
const shiftEndTime = new Date(Date.now() + 4 * 60 * 60 * 1000);
const shiftStartTime = new Date(Date.now() - 8 * 60 * 60 * 1000);

const MOCK_CURRENT_SHIFT: OnCallShift[] = [
  {
    id: 'shift-current-primary',
    personId: 'person-1',
    type: 'primary',
    startTime: shiftStartTime,
    endTime: shiftEndTime,
  },
  {
    id: 'shift-current-secondary',
    personId: 'person-2',
    type: 'secondary',
    startTime: shiftStartTime,
    endTime: shiftEndTime,
  },
];

// Weekly schedule - generate for 7 days
const generateWeeklySchedule = (): OnCallShift[] => {
  const shifts: OnCallShift[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rotationPrimary = ['person-1', 'person-3', 'person-5', 'person-1', 'person-3', 'person-5', 'person-1'];
  const rotationSecondary = ['person-2', 'person-4', 'person-6', 'person-2', 'person-4', 'person-6', 'person-2'];

  for (let i = 0; i < 7; i++) {
    const dayStart = new Date(today);
    dayStart.setDate(today.getDate() + i);
    dayStart.setHours(8, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setHours(20, 0, 0, 0);

    const nightEnd = new Date(dayStart);
    nightEnd.setDate(nightEnd.getDate() + 1);
    nightEnd.setHours(8, 0, 0, 0);

    // Day shift
    shifts.push({
      id: `shift-day-primary-${i}`,
      personId: rotationPrimary[i],
      type: 'primary',
      startTime: dayStart,
      endTime: dayEnd,
    });
    shifts.push({
      id: `shift-day-secondary-${i}`,
      personId: rotationSecondary[i],
      type: 'secondary',
      startTime: dayStart,
      endTime: dayEnd,
    });

    // Night shift (different person)
    shifts.push({
      id: `shift-night-primary-${i}`,
      personId: rotationSecondary[i],
      type: 'primary',
      startTime: dayEnd,
      endTime: nightEnd,
    });
    shifts.push({
      id: `shift-night-secondary-${i}`,
      personId: rotationPrimary[(i + 1) % 7],
      type: 'secondary',
      startTime: dayEnd,
      endTime: nightEnd,
    });
  }

  return shifts;
};

const MOCK_ESCALATION_POLICIES: EscalationPolicy[] = [
  {
    id: 'policy-1',
    name: 'Critical AI Incident',
    description: 'For critical agent failures, safety violations, or compliance breaches',
    triggerConditions: [
      'Agent error rate > 10%',
      'Safety guardrail bypass detected',
      'PII exposure incident',
      'Agent unresponsive > 5 minutes',
    ],
    tiers: [
      { tier: 1, name: 'Primary On-Call', contactMethod: 'pagerduty', delayMinutes: 0 },
      { tier: 2, name: 'Secondary On-Call', contactMethod: 'phone', delayMinutes: 5 },
      { tier: 3, name: 'AI Ops Lead', contactMethod: 'phone', delayMinutes: 15 },
      { tier: 4, name: 'VP Engineering', contactMethod: 'phone', delayMinutes: 30 },
    ],
    notificationChannels: ['PagerDuty', 'Slack #ai-incidents', 'SMS'],
    enabled: true,
  },
  {
    id: 'policy-2',
    name: 'High Priority Alert',
    description: 'For degraded performance or elevated error rates',
    triggerConditions: [
      'Agent error rate > 5%',
      'Latency p99 > 2 seconds',
      'Guardrail block rate > 10%',
    ],
    tiers: [
      { tier: 1, name: 'Primary On-Call', contactMethod: 'slack', delayMinutes: 0 },
      { tier: 2, name: 'Secondary On-Call', contactMethod: 'pagerduty', delayMinutes: 10 },
      { tier: 3, name: 'AI Ops Lead', contactMethod: 'phone', delayMinutes: 20 },
    ],
    notificationChannels: ['Slack #ai-alerts', 'Email'],
    enabled: true,
  },
  {
    id: 'policy-3',
    name: 'Compliance Deadline',
    description: 'For regulatory reporting deadline escalation (EU AI Act Art. 73)',
    triggerConditions: [
      'Serious incident not reported within 24 hours',
      'Art. 73 2-day deadline approaching',
      'Audit finding requires immediate response',
    ],
    tiers: [
      { tier: 1, name: 'Compliance Officer', contactMethod: 'email', delayMinutes: 0 },
      { tier: 2, name: 'AI Ops Lead', contactMethod: 'slack', delayMinutes: 30 },
      { tier: 3, name: 'Chief Compliance Officer', contactMethod: 'phone', delayMinutes: 60 },
      { tier: 4, name: 'General Counsel', contactMethod: 'phone', delayMinutes: 120 },
    ],
    notificationChannels: ['Email', 'Slack #compliance'],
    enabled: true,
  },
  {
    id: 'policy-4',
    name: 'After-Hours Support',
    description: 'For non-critical issues outside business hours',
    triggerConditions: [
      'Customer-reported issue',
      'Non-critical agent degradation',
      'Scheduled maintenance conflict',
    ],
    tiers: [
      { tier: 1, name: 'Primary On-Call', contactMethod: 'slack', delayMinutes: 0 },
      { tier: 2, name: 'Secondary On-Call', contactMethod: 'phone', delayMinutes: 30 },
    ],
    notificationChannels: ['Slack #support-oncall'],
    enabled: true,
  },
];

const MOCK_NOTIFICATION_CHANNELS: NotificationChannel[] = [
  {
    id: 'channel-1',
    type: 'pagerduty',
    name: 'PagerDuty',
    status: 'connected',
    config: 'Service: AI Platform Ops, Integration Key: ****1234',
    lastTest: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: 'channel-2',
    type: 'opsgenie',
    name: 'OpsGenie',
    status: 'connected',
    config: 'Team: AI Ops, API Key: ****5678',
    lastTest: new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
  {
    id: 'channel-3',
    type: 'slack',
    name: 'Slack - #ai-incidents',
    status: 'connected',
    config: 'Webhook: ****9012, Channel: #ai-incidents',
    lastTest: new Date(Date.now() - 1 * 60 * 60 * 1000),
  },
  {
    id: 'channel-4',
    type: 'slack',
    name: 'Slack - #ai-alerts',
    status: 'connected',
    config: 'Webhook: ****3456, Channel: #ai-alerts',
    lastTest: new Date(Date.now() - 3 * 60 * 60 * 1000),
  },
  {
    id: 'channel-5',
    type: 'sms',
    name: 'SMS/Phone',
    status: 'connected',
    config: 'Provider: Twilio, Account: ****7890',
    lastTest: new Date(Date.now() - 48 * 60 * 60 * 1000),
  },
  {
    id: 'channel-6',
    type: 'email',
    name: 'Email Distribution',
    status: 'connected',
    config: 'DL: ai-ops-oncall@fsi-bank.com, SMTP: configured',
    lastTest: new Date(Date.now() - 6 * 60 * 60 * 1000),
  },
];

const MOCK_ONCALL_HISTORY: OnCallHistoryEntry[] = [
  {
    id: 'hist-1',
    personId: 'person-1',
    shiftStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    shiftEnd: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000),
    pagesReceived: 8,
    avgResponseTime: 142,
    escalations: 1,
    incidents: 2,
  },
  {
    id: 'hist-2',
    personId: 'person-2',
    shiftStart: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    shiftEnd: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000),
    pagesReceived: 3,
    avgResponseTime: 98,
    escalations: 0,
    incidents: 0,
  },
  {
    id: 'hist-3',
    personId: 'person-3',
    shiftStart: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    shiftEnd: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000),
    pagesReceived: 12,
    avgResponseTime: 215,
    escalations: 3,
    incidents: 4,
  },
  {
    id: 'hist-4',
    personId: 'person-4',
    shiftStart: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    shiftEnd: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000),
    pagesReceived: 5,
    avgResponseTime: 178,
    escalations: 1,
    incidents: 1,
  },
  {
    id: 'hist-5',
    personId: 'person-5',
    shiftStart: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    shiftEnd: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000),
    pagesReceived: 6,
    avgResponseTime: 125,
    escalations: 0,
    incidents: 1,
  },
  {
    id: 'hist-6',
    personId: 'person-6',
    shiftStart: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    shiftEnd: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000),
    pagesReceived: 4,
    avgResponseTime: 156,
    escalations: 0,
    incidents: 0,
  },
  {
    id: 'hist-7',
    personId: 'person-1',
    shiftStart: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    shiftEnd: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000),
    pagesReceived: 7,
    avgResponseTime: 134,
    escalations: 2,
    incidents: 1,
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

function formatTimeRemaining(endTime: Date): string {
  const diff = endTime.getTime() - Date.now();
  if (diff <= 0) return 'Ended';

  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatTimeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getPersonById(id: string): OnCallPerson | undefined {
  return MOCK_TEAM.find(p => p.id === id);
}

// Color mapping for team members in schedule
const PERSON_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'person-1': { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-300' },
  'person-2': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  'person-3': { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
  'person-4': { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
  'person-5': { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-300' },
  'person-6': { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-300' },
};

const CHANNEL_ICONS: Record<NotificationChannel['type'], IconName> = {
  pagerduty: 'bell-alert',
  opsgenie: 'bell',
  slack: 'chat-bubble',
  sms: 'phone',
  email: 'envelope',
};

const CHANNEL_STATUS_STYLES: Record<NotificationChannel['status'], { bg: string; text: string; dot: string }> = {
  connected: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  disconnected: { bg: 'bg-slate-50', text: 'text-slate-500', dot: 'bg-slate-400' },
  error: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
};

// ============================================================================
// Panel Components
// ============================================================================

function CurrentOnCallPanel({
  shifts,
  team,
}: {
  shifts: OnCallShift[];
  team: OnCallPerson[];
}) {
  const primaryShift = shifts.find(s => s.type === 'primary');
  const secondaryShift = shifts.find(s => s.type === 'secondary');

  const primary = primaryShift ? getPersonById(primaryShift.personId) : undefined;
  const secondary = secondaryShift ? getPersonById(secondaryShift.personId) : undefined;

  // Escalation chain
  const escalationChain: OnCallPerson[] = [
    primary,
    secondary,
    team.find(p => p.role === 'AI Ops Lead'),
    team.find(p => p.role === 'DevOps Manager'),
  ].filter(Boolean) as OnCallPerson[];

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-50/50 to-indigo-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
            <Icon name="users" className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Current On-Call</h3>
            <p className="text-[11px] text-slate-500">Active rotation and escalation chain</p>
          </div>
        </div>
        {primaryShift && (
          <div className="text-right">
            <div className="text-[10px] text-slate-500">Shift ends in</div>
            <div className="text-lg font-semibold text-violet-700">{formatTimeRemaining(primaryShift.endTime)}</div>
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Primary On-Call */}
        {primary && (
          <div className="p-4 rounded-lg border-2 border-violet-200 bg-violet-50/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-violet-200 flex items-center justify-center text-sm font-semibold text-violet-700">
                  {primary.photoPlaceholder}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{primary.name}</div>
                  <div className="text-[11px] text-violet-600 font-medium">Primary On-Call</div>
                  <div className="text-[10px] text-slate-500">{primary.role} - {primary.team}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`slack://user?team=T00000000&id=${primary.slack.replace('@', '')}`}
                  className="p-2 rounded-lg bg-purple-100 text-purple-600 hover:bg-purple-200 transition"
                  title="Slack"
                >
                  <Icon name="chat-bubble" className="w-4 h-4" />
                </a>
                <a
                  href={`tel:${primary.phone}`}
                  className="p-2 rounded-lg bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition"
                  title="Call"
                >
                  <Icon name="phone" className="w-4 h-4" />
                </a>
                <a
                  href={`mailto:${primary.email}`}
                  className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition"
                  title="Email"
                >
                  <Icon name="envelope" className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Secondary On-Call */}
        {secondary && (
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
                  {secondary.photoPlaceholder}
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-800">{secondary.name}</div>
                  <div className="text-[11px] text-slate-500">Secondary On-Call</div>
                  <div className="text-[10px] text-slate-400">{secondary.role}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <a
                  href={`slack://user?team=T00000000&id=${secondary.slack.replace('@', '')}`}
                  className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
                  title="Slack"
                >
                  <Icon name="chat-bubble" className="w-3.5 h-3.5" />
                </a>
                <a
                  href={`tel:${secondary.phone}`}
                  className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
                  title="Call"
                >
                  <Icon name="phone" className="w-3.5 h-3.5" />
                </a>
                <a
                  href={`mailto:${secondary.email}`}
                  className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
                  title="Email"
                >
                  <Icon name="envelope" className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Escalation Chain */}
        <div className="pt-4 border-t border-slate-100">
          <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-3">
            Escalation Chain
          </div>
          <div className="flex items-center gap-2">
            {escalationChain.map((person, idx) => (
              <div key={person.id} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                    idx === 0 ? 'bg-violet-200 text-violet-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {person.photoPlaceholder}
                  </div>
                  <div className="text-[10px]">
                    <div className="font-medium text-slate-700">{person.name.split(' ')[0]}</div>
                    <div className="text-slate-400">Tier {idx + 1}</div>
                  </div>
                </div>
                {idx < escalationChain.length - 1 && (
                  <Icon name="chevron-right" className="w-4 h-4 text-slate-300" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Override Button */}
        <button
          disabled
          title="Demo — override not wired"
          className="w-full mt-4 py-2 px-4 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 text-sm font-medium cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Icon name="arrow-path" className="w-4 h-4" />
          Override Current On-Call
          <MockDataBadge />
        </button>
      </div>
    </div>
  );
}

function SchedulePanel({
  shifts,
  team,
}: {
  shifts: OnCallShift[];
  team: OnCallPerson[];
}) {
  // Group shifts by day
  const days = useMemo(() => {
    const dayMap = new Map<string, OnCallShift[]>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const day = new Date(today);
      day.setDate(today.getDate() + i);
      const dayKey = day.toISOString().split('T')[0];
      dayMap.set(dayKey, []);
    }

    shifts.forEach(shift => {
      const dayKey = shift.startTime.toISOString().split('T')[0];
      const existing = dayMap.get(dayKey);
      if (existing) {
        existing.push(shift);
      }
    });

    return Array.from(dayMap.entries()).map(([date, dayShifts]) => ({
      date: new Date(date),
      shifts: dayShifts,
    }));
  }, [shifts]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <Icon name="calendar" className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Weekly Schedule</h3>
            <p className="text-[11px] text-slate-500">Rotation view (demo — shift reordering not wired)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MockDataBadge />
          <span className="text-[10px] text-slate-500">Color by person</span>
        </div>
      </div>

      {/* Legend */}
      <div className="px-5 py-2 border-b border-slate-100 flex flex-wrap gap-2">
        {team.slice(0, 6).map(person => {
          const colors = PERSON_COLORS[person.id] || PERSON_COLORS['person-1'];
          return (
            <span
              key={person.id}
              className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${colors.bg} ${colors.text}`}
            >
              {person.name.split(' ')[0]}
            </span>
          );
        })}
      </div>

      {/* Calendar Grid */}
      <div className="p-4">
        <div className="grid grid-cols-7 gap-2">
          {days.map(({ date, shifts: dayShifts }) => {
            const isToday = date.toDateString() === new Date().toDateString();
            const dayShiftsPrimary = dayShifts.filter(s => s.type === 'primary' && s.startTime.getHours() < 20);
            const nightShiftsPrimary = dayShifts.filter(s => s.type === 'primary' && s.startTime.getHours() >= 20);

            return (
              <div
                key={date.toISOString()}
                className={`p-2 rounded-lg border ${isToday ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'}`}
              >
                <div className={`text-[10px] font-semibold mb-2 ${isToday ? 'text-indigo-700' : 'text-slate-600'}`}>
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  <span className="ml-1 text-slate-400">{date.getDate()}</span>
                </div>

                {/* Day Shift */}
                {dayShiftsPrimary.map(shift => {
                  const person = getPersonById(shift.personId);
                  const colors = PERSON_COLORS[shift.personId] || PERSON_COLORS['person-1'];
                  if (!person) return null;

                  return (
                    <div
                      key={shift.id}
                      className={`mb-1 p-1.5 rounded text-[9px] border ${colors.bg} ${colors.text} ${colors.border}`}
                    >
                      <div className="font-semibold">{person.name.split(' ')[0]}</div>
                      <div className="text-[8px] opacity-70">8AM-8PM</div>
                    </div>
                  );
                })}

                {/* Night Shift */}
                {nightShiftsPrimary.map(shift => {
                  const person = getPersonById(shift.personId);
                  const colors = PERSON_COLORS[shift.personId] || PERSON_COLORS['person-1'];
                  if (!person) return null;

                  return (
                    <div
                      key={shift.id}
                      className={`p-1.5 rounded text-[9px] border ${colors.bg} ${colors.text} ${colors.border} opacity-70`}
                    >
                      <div className="font-semibold">{person.name.split(' ')[0]}</div>
                      <div className="text-[8px] opacity-70">8PM-8AM</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EscalationPoliciesPanel({
  policies,
  onCreatePolicy,
}: {
  policies: EscalationPolicy[];
  onCreatePolicy: () => void;
}) {
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <Icon name="bell-alert" className="w-5 h-5 text-rose-600" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Escalation Policies</h3>
            <p className="text-[11px] text-slate-500">{policies.length} policies configured</p>
          </div>
        </div>
        <button
          onClick={onCreatePolicy}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-medium hover:bg-indigo-700 transition flex items-center gap-1"
        >
          <Icon name="plus" className="w-3.5 h-3.5" />
          Create Policy
        </button>
      </div>

      <div className="divide-y divide-slate-100">
        {policies.map(policy => {
          const isExpanded = expandedPolicy === policy.id;

          return (
            <div key={policy.id} className="p-4">
              <button
                onClick={() => setExpandedPolicy(isExpanded ? null : policy.id)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${policy.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{policy.name}</div>
                      <div className="text-[11px] text-slate-500">{policy.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {policy.tiers.length} tiers
                    </span>
                    <Icon
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      className="w-4 h-4 text-slate-400"
                    />
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                  {/* Trigger Conditions */}
                  <div>
                    <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-2">
                      Trigger Conditions
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {policy.triggerConditions.map((condition, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200"
                        >
                          {condition}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Escalation Tiers */}
                  <div>
                    <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-2">
                      Escalation Tiers
                    </div>
                    <div className="space-y-2">
                      {policy.tiers.map((tier, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 flex items-center justify-center">
                              {tier.tier}
                            </span>
                            <span className="text-[11px] font-medium text-slate-700">{tier.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <span className="text-slate-500">via {tier.contactMethod}</span>
                            <span className="text-slate-400">
                              {tier.delayMinutes === 0 ? 'immediately' : `+${tier.delayMinutes}m`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Notification Channels */}
                  <div>
                    <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-2">
                      Notification Channels
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {policy.notificationChannels.map((channel, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200"
                        >
                          {channel}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      disabled
                      title="Demo — escalation test not wired"
                      className="px-3 py-1.5 rounded bg-slate-100 text-slate-400 text-[10px] font-medium cursor-not-allowed flex items-center gap-1"
                    >
                      <Icon name="beaker" className="w-3.5 h-3.5" />
                      Test Escalation
                    </button>
                    <button
                      disabled
                      title="Demo — not wired"
                      className="px-3 py-1.5 rounded bg-slate-100 text-slate-400 text-[10px] font-medium cursor-not-allowed"
                    >
                      Edit Policy
                    </button>
                    <MockDataBadge />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NotificationChannelsPanel({
  channels,
}: {
  channels: NotificationChannel[];
}) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <Icon name="megaphone" className="w-5 h-5 text-blue-600" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Notification Channels</h3>
            <p className="text-[11px] text-slate-500">Integration status and configuration</p>
          </div>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {channels.map(channel => {
          const statusStyle = CHANNEL_STATUS_STYLES[channel.status];
          const icon = CHANNEL_ICONS[channel.type];

          return (
            <div
              key={channel.id}
              className={`p-4 rounded-lg border ${statusStyle.bg} border-slate-200`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon name={icon} className={`w-5 h-5 ${statusStyle.text}`} />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{channel.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                      <span className={`text-[10px] font-medium ${statusStyle.text}`}>
                        {channel.status.charAt(0).toUpperCase() + channel.status.slice(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 mb-3">{channel.config}</div>

              <div className="flex items-center justify-between">
                <span className="text-[9px] text-slate-400">
                  {channel.lastTest ? `Last tested ${formatTimeSince(channel.lastTest)}` : 'Never tested'}
                </span>
                <span className="flex items-center gap-1.5">
                  <MockDataBadge />
                  <button
                    disabled
                    title="Demo — channel test not wired"
                    className="px-2 py-1 rounded bg-white text-[10px] font-medium text-slate-400 border border-slate-200 cursor-not-allowed"
                  >
                    Test
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OnCallHistoryPanel({
  history,
}: {
  history: OnCallHistoryEntry[];
}) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <Icon name="clock" className="w-5 h-5 text-slate-600" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">On-Call History</h3>
            <p className="text-[11px] text-slate-500">Past shifts and response metrics</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 text-[10px] text-slate-500 uppercase tracking-wide">
              <th scope="col" className="px-4 py-2.5 text-left font-medium">Person</th>
              <th scope="col" className="px-4 py-2.5 text-left font-medium">Shift</th>
              <th scope="col" className="px-4 py-2.5 text-center font-medium">Pages</th>
              <th scope="col" className="px-4 py-2.5 text-center font-medium">Avg Response</th>
              <th scope="col" className="px-4 py-2.5 text-center font-medium">Escalations</th>
              <th scope="col" className="px-4 py-2.5 text-center font-medium">Incidents</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {history.map(entry => {
              const person = getPersonById(entry.personId);
              if (!person) return null;

              const colors = PERSON_COLORS[entry.personId] || PERSON_COLORS['person-1'];
              const responseTimeColor = entry.avgResponseTime < 120 ? 'text-emerald-600' : entry.avgResponseTime < 180 ? 'text-amber-600' : 'text-rose-600';

              return (
                <tr key={entry.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold ${colors.bg} ${colors.text}`}>
                        {person.photoPlaceholder}
                      </div>
                      <div>
                        <div className="text-[11px] font-medium text-slate-800">{person.name}</div>
                        <div className="text-[10px] text-slate-400">{person.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[11px] text-slate-700">{formatDate(entry.shiftStart)}</div>
                    <div className="text-[10px] text-slate-400">
                      {formatTime(entry.shiftStart)} - {formatTime(entry.shiftEnd)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-[11px] font-semibold text-slate-700">{entry.pagesReceived}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[11px] font-semibold ${responseTimeColor}`}>
                      {Math.floor(entry.avgResponseTime / 60)}m {entry.avgResponseTime % 60}s
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[11px] font-semibold ${entry.escalations > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                      {entry.escalations}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[11px] font-semibold ${entry.incidents > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {entry.incidents}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatsPanel({ history }: { history: OnCallHistoryEntry[] }) {
  const stats = useMemo(() => {
    const totalPages = history.reduce((sum, h) => sum + h.pagesReceived, 0);
    const totalEscalations = history.reduce((sum, h) => sum + h.escalations, 0);
    const avgResponseTime = history.length > 0
      ? history.reduce((sum, h) => sum + h.avgResponseTime, 0) / history.length
      : 0;

    // Calculate per-person stats
    const personStats = new Map<string, { pages: number; responseTime: number; shifts: number; escalations: number }>();
    history.forEach(h => {
      const existing = personStats.get(h.personId) || { pages: 0, responseTime: 0, shifts: 0, escalations: 0 };
      existing.pages += h.pagesReceived;
      existing.responseTime += h.avgResponseTime;
      existing.shifts += 1;
      existing.escalations += h.escalations;
      personStats.set(h.personId, existing);
    });

    // Find best/worst response times
    const sortedByResponse = Array.from(personStats.entries())
      .map(([personId, stats]) => ({
        personId,
        avgResponse: stats.responseTime / stats.shifts,
        pagesPerShift: stats.pages / stats.shifts,
      }))
      .sort((a, b) => a.avgResponse - b.avgResponse);

    // After-hours calculation (simplified - assume 8PM-8AM is after hours)
    const afterHoursPages = history
      .filter(h => h.shiftStart.getHours() >= 20 || h.shiftStart.getHours() < 8)
      .reduce((sum, h) => sum + h.pagesReceived, 0);
    const businessHoursPages = totalPages - afterHoursPages;

    return {
      totalPages,
      avgResponseTime: Math.round(avgResponseTime),
      escalationRate: totalPages > 0 ? (totalEscalations / totalPages * 100).toFixed(1) : '0',
      pagesPerShift: history.length > 0 ? (totalPages / history.length).toFixed(1) : '0',
      bestResponder: sortedByResponse[0],
      afterHoursRatio: totalPages > 0 ? ((afterHoursPages / totalPages) * 100).toFixed(0) : '0',
      afterHoursPages,
      businessHoursPages,
    };
  }, [history]);

  const bestPerson = stats.bestResponder ? getPersonById(stats.bestResponder.personId) : null;

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Avg Response Time"
          value={`${Math.floor(stats.avgResponseTime / 60)}m ${stats.avgResponseTime % 60}s`}
          variant={stats.avgResponseTime < 120 ? 'success' : stats.avgResponseTime < 180 ? 'warning' : 'danger'}
          sub="across all shifts"
          size="sm"
        />
        <StatCard
          label="Pages per Shift"
          value={stats.pagesPerShift}
          variant="info"
          sub={`${stats.totalPages} total pages`}
          size="sm"
        />
        <StatCard
          label="Escalation Rate"
          value={`${stats.escalationRate}%`}
          variant={parseFloat(stats.escalationRate) < 10 ? 'success' : 'warning'}
          sub="pages escalated"
          size="sm"
        />
        <StatCard
          label="After-Hours"
          value={`${stats.afterHoursRatio}%`}
          variant="muted"
          sub={`${stats.afterHoursPages} pages`}
          size="sm"
        />
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Response Time by Person */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Response Time by Person</h4>
          <div className="space-y-2">
            {MOCK_TEAM.slice(0, 6).map(person => {
              const personHistory = history.filter(h => h.personId === person.id);
              if (personHistory.length === 0) return null;

              const avgResponse = personHistory.reduce((sum, h) => sum + h.avgResponseTime, 0) / personHistory.length;
              const maxWidth = 180; // seconds
              const width = Math.min((avgResponse / maxWidth) * 100, 100);
              const colors = PERSON_COLORS[person.id] || PERSON_COLORS['person-1'];

              return (
                <div key={person.id} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold ${colors.bg} ${colors.text}`}>
                    {person.photoPlaceholder}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-slate-700">{person.name.split(' ')[0]}</span>
                      <span className={`text-[10px] font-semibold ${
                        avgResponse < 120 ? 'text-emerald-600' : avgResponse < 180 ? 'text-amber-600' : 'text-rose-600'
                      }`}>
                        {Math.floor(avgResponse / 60)}m {Math.round(avgResponse % 60)}s
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          avgResponse < 120 ? 'bg-emerald-500' : avgResponse < 180 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Best Performer */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Best Performer This Week</h4>
          {bestPerson && stats.bestResponder && (
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold ${
                PERSON_COLORS[stats.bestResponder.personId]?.bg || 'bg-violet-100'
              } ${PERSON_COLORS[stats.bestResponder.personId]?.text || 'text-violet-700'}`}>
                {bestPerson.photoPlaceholder}
              </div>
              <div>
                <div className="text-lg font-semibold text-slate-900">{bestPerson.name}</div>
                <div className="text-[11px] text-slate-500">{bestPerson.role}</div>
                <div className="flex items-center gap-3 mt-2">
                  <div className="text-center">
                    <div className="text-sm font-semibold text-emerald-600">
                      {Math.floor(stats.bestResponder.avgResponse / 60)}m {Math.round(stats.bestResponder.avgResponse % 60)}s
                    </div>
                    <div className="text-[9px] text-slate-400">avg response</div>
                  </div>
                  <div className="w-px h-8 bg-slate-200" />
                  <div className="text-center">
                    <div className="text-sm font-semibold text-slate-700">
                      {stats.bestResponder.pagesPerShift.toFixed(1)}
                    </div>
                    <div className="text-[9px] text-slate-400">pages/shift</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Business vs After Hours */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Page Distribution
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-4 rounded-full bg-slate-100 overflow-hidden flex">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${100 - parseFloat(stats.afterHoursRatio)}%` }}
                />
                <div
                  className="h-full bg-indigo-500"
                  style={{ width: `${stats.afterHoursRatio}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between mt-1 text-[10px]">
              <span className="text-blue-600">Business Hours ({stats.businessHoursPages})</span>
              <span className="text-indigo-600">After Hours ({stats.afterHoursPages})</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function OnCallCenter() {
  const [activeTab, setActiveTab] = useState<TabId>('current');
  const [showPolicyModal, setShowPolicyModal] = useState(false);

  // Live data hooks
  const { loading: onCallLoading, data: liveOnCallData, live: isOnCallLive } = useOnCall();
  const { loading: policiesLoading, policies: livePolicies, live: isPoliciesLive } = useEscalationPolicies();

  // Use live data if available, otherwise fall back to mock
  const team = liveOnCallData?.team ?? MOCK_TEAM;
  const currentShift = liveOnCallData?.currentShift ?? MOCK_CURRENT_SHIFT;
  const escalationPolicies = livePolicies.length > 0 ? livePolicies : MOCK_ESCALATION_POLICIES;
  const notificationChannels = liveOnCallData?.notificationChannels ?? MOCK_NOTIFICATION_CHANNELS;
  const onCallHistory = liveOnCallData?.history ?? MOCK_ONCALL_HISTORY;
  const weeklySchedule = useMemo(() => liveOnCallData?.weeklySchedule ?? generateWeeklySchedule(), [liveOnCallData]);

  const isLive = isOnCallLive || isPoliciesLive;
  const isLoading = onCallLoading || policiesLoading;

  const handleCreatePolicy = () => {
    setShowPolicyModal(true);
  };

  const tabs: { id: TabId; label: string; icon: IconName }[] = [
    { id: 'current', label: 'Current On-Call', icon: 'users' },
    { id: 'schedule', label: 'Schedule', icon: 'calendar' },
    { id: 'policies', label: 'Escalation Policies', icon: 'bell-alert' },
    { id: 'channels', label: 'Notification Channels', icon: 'megaphone' },
    { id: 'history', label: 'History', icon: 'clock' },
    { id: 'stats', label: 'Statistics', icon: 'chart-bar' },
  ];

  return (
    <div className="space-y-6">
      {/* Data Source Badge */}
      <div className="flex justify-end">
        {isLive ? <LiveDataBadge source="PagerDuty" /> : <MockDataBadge integration="PagerDuty / OpsGenie / Slack" />}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Icon name="spinner" className="w-6 h-6 text-indigo-600 animate-spin" />
          <span className="ml-2 text-sm text-slate-600">Loading on-call data...</span>
        </div>
      )}

      {!isLoading && (
        <>
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-6 bg-slate-100 rounded-lg p-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-medium transition whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <Icon name={tab.icon} className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'current' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CurrentOnCallPanel shifts={currentShift} team={team} />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Shift Time Remaining"
                value={formatTimeRemaining(shiftEndTime)}
                variant="info"
                sub="until rotation"
                size="sm"
              />
              <StatCard
                label="Active Policies"
                value={escalationPolicies.filter(p => p.enabled).length}
                variant="success"
                sub={`of ${escalationPolicies.length} total`}
                size="sm"
              />
            </div>
            <NotificationChannelsPanel
              channels={notificationChannels.slice(0, 4)}
            />
          </div>
        </div>
      )}

      {activeTab === 'schedule' && (
        <SchedulePanel shifts={weeklySchedule} team={team} />
      )}

      {activeTab === 'policies' && (
        <EscalationPoliciesPanel
          policies={escalationPolicies}
          onCreatePolicy={handleCreatePolicy}
        />
      )}

      {activeTab === 'channels' && (
        <NotificationChannelsPanel
          channels={notificationChannels}
        />
      )}

      {activeTab === 'history' && (
        <OnCallHistoryPanel history={onCallHistory} />
      )}

      {activeTab === 'stats' && (
        <StatsPanel history={onCallHistory} />
      )}
        </>
      )}

      {/* Policy Create/Edit Modal (placeholder) */}
      {showPolicyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-900">Create Escalation Policy</h3>
                <MockDataBadge />
              </div>
              <button
                onClick={() => setShowPolicyModal(false)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <Icon name="x-mark" className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Define trigger conditions, escalation tiers, and notification channels for your new policy.
              Policy creation is not wired in this demo.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Policy Name</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  placeholder="e.g., Critical AI Incident"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  rows={2}
                  placeholder="When should this policy trigger?"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowPolicyModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                disabled
                title="Demo — policy creation not wired"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-200 text-slate-400 cursor-not-allowed"
              >
                Create Policy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
