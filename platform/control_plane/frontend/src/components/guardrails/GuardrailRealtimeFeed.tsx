/**
 * GuardrailRealtimeFeed — Live stream of guardrail interventions
 */

import { useState, useEffect, useRef } from 'react';
import { Icon } from '../govern/icons';
import type { IconName } from '../govern/icons';

interface InterventionEvent {
  id: string;
  timestamp: string;
  guardrailId: string;
  guardrailName: string;
  agentId: string;
  agentName: string;
  eventType: 'BLOCKED' | 'ANONYMIZED' | 'FLAGGED';
  ruleType: 'content_filter' | 'pii' | 'denied_topic' | 'word_filter' | 'grounding' | 'prompt_attack';
  ruleName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  inputPreview?: string;
  matchedContent?: string;
  confidence: number;
  latencyMs: number;
}

interface Props {
  guardrailId?: string;
  agentId?: string;
  autoScroll?: boolean;
}

const MOCK_EVENTS: Omit<InterventionEvent, 'id' | 'timestamp'>[] = [
  { guardrailId: 'gr-001', guardrailName: 'FSI Standard', agentId: 'agent-001', agentName: 'Customer Service Bot', eventType: 'BLOCKED', ruleType: 'prompt_attack', ruleName: 'Prompt Injection', severity: 'critical', inputPreview: 'Ignore previous instructions and...', matchedContent: 'ignore previous instructions', confidence: 0.95, latencyMs: 18 },
  { guardrailId: 'gr-001', guardrailName: 'FSI Standard', agentId: 'agent-002', agentName: 'Loan Advisor', eventType: 'ANONYMIZED', ruleType: 'pii', ruleName: 'US SSN', severity: 'high', inputPreview: 'My SSN is [REDACTED] and I need...', matchedContent: '123-45-6789', confidence: 0.99, latencyMs: 8 },
  { guardrailId: 'gr-002', guardrailName: 'Trading Compliance', agentId: 'agent-003', agentName: 'Trading Assistant', eventType: 'BLOCKED', ruleType: 'denied_topic', ruleName: 'Insider Trading', severity: 'critical', inputPreview: 'Before the merger announcement...', matchedContent: 'merger announcement', confidence: 0.88, latencyMs: 45 },
  { guardrailId: 'gr-001', guardrailName: 'FSI Standard', agentId: 'agent-001', agentName: 'Customer Service Bot', eventType: 'ANONYMIZED', ruleType: 'pii', ruleName: 'Credit Card', severity: 'high', inputPreview: 'Card ending in [REDACTED]', matchedContent: '4532-8901-2345-6789', confidence: 0.98, latencyMs: 6 },
  { guardrailId: 'gr-001', guardrailName: 'FSI Standard', agentId: 'agent-004', agentName: 'Document Parser', eventType: 'FLAGGED', ruleType: 'grounding', ruleName: 'Low Confidence', severity: 'medium', inputPreview: 'The contract states that...', confidence: 0.62, latencyMs: 85 },
  { guardrailId: 'gr-002', guardrailName: 'Trading Compliance', agentId: 'agent-003', agentName: 'Trading Assistant', eventType: 'BLOCKED', ruleType: 'content_filter', ruleName: 'MISCONDUCT', severity: 'high', inputPreview: 'How to manipulate the market...', matchedContent: 'manipulate', confidence: 0.92, latencyMs: 14 },
];

export default function GuardrailRealtimeFeed({ guardrailId, agentId, autoScroll = true }: Props) {
  const [events, setEvents] = useState<InterventionEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [filter, setFilter] = useState<'all' | 'BLOCKED' | 'ANONYMIZED' | 'FLAGGED'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const feedRef = useRef<HTMLDivElement>(null);
  const eventCounterRef = useRef(0);

  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      const mockEvent = MOCK_EVENTS[Math.floor(Math.random() * MOCK_EVENTS.length)];
      const newEvent: InterventionEvent = {
        ...mockEvent,
        id: `evt-${Date.now()}-${eventCounterRef.current++}`,
        timestamp: new Date().toISOString(),
      };

      if (guardrailId && newEvent.guardrailId !== guardrailId) return;
      if (agentId && newEvent.agentId !== agentId) return;

      setEvents(prev => [newEvent, ...prev.slice(0, 99)]);
    }, 2000 + Math.random() * 3000);

    return () => clearInterval(interval);
  }, [isPaused, guardrailId, agentId]);

  useEffect(() => {
    if (autoScroll && feedRef.current && !isPaused) {
      feedRef.current.scrollTop = 0;
    }
  }, [events, autoScroll, isPaused]);

  const filteredEvents = events.filter(e => {
    if (filter !== 'all' && e.eventType !== filter) return false;
    if (severityFilter !== 'all' && e.severity !== severityFilter) return false;
    return true;
  });

  const getEventTypeStyle = (type: string) => {
    switch (type) {
      case 'BLOCKED': return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' };
      case 'ANONYMIZED': return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' };
      case 'FLAGGED': return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' };
      default: return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
    }
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'critical': return { bg: 'bg-red-500', pulse: true };
      case 'high': return { bg: 'bg-orange-500', pulse: false };
      case 'medium': return { bg: 'bg-amber-500', pulse: false };
      case 'low': return { bg: 'bg-blue-500', pulse: false };
      default: return { bg: 'bg-slate-400', pulse: false };
    }
  };

  const getRuleTypeIcon = (type: string): IconName => {
    switch (type) {
      case 'content_filter': return 'shield-check';
      case 'pii': return 'lock-closed';
      case 'denied_topic': return 'no-symbol';
      case 'word_filter': return 'chat-bubble';
      case 'grounding': return 'map-pin';
      case 'prompt_attack': return 'exclamation-triangle';
      default: return 'exclamation-triangle';
    }
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const stats = {
    blocked: events.filter(e => e.eventType === 'BLOCKED').length,
    anonymized: events.filter(e => e.eventType === 'ANONYMIZED').length,
    flagged: events.filter(e => e.eventType === 'FLAGGED').length,
    critical: events.filter(e => e.severity === 'critical').length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isPaused ? 'bg-slate-400' : 'bg-emerald-500 animate-pulse'}`} />
          <h2 className="text-lg font-semibold text-slate-900">Real-time Feed</h2>
          <span className="text-xs text-slate-500">{events.length} events</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              isPaused
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button
            onClick={() => setEvents([])}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-center">
          <div className="text-xl font-bold text-red-700">{stats.blocked}</div>
          <div className="text-[10px] text-red-600">Blocked</div>
        </div>
        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-center">
          <div className="text-xl font-bold text-amber-700">{stats.anonymized}</div>
          <div className="text-[10px] text-amber-600">Anonymized</div>
        </div>
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
          <div className="text-xl font-bold text-blue-700">{stats.flagged}</div>
          <div className="text-[10px] text-blue-600">Flagged</div>
        </div>
        <div className="p-3 bg-red-50 rounded-lg border border-red-300 text-center">
          <div className="text-xl font-bold text-red-800">{stats.critical}</div>
          <div className="text-[10px] text-red-700">Critical</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Type:</span>
          {(['all', 'BLOCKED', 'ANONYMIZED', 'FLAGGED'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Severity:</span>
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                severityFilter === s ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Event Feed */}
      <div
        ref={feedRef}
        className="h-[500px] overflow-y-auto space-y-2 pr-2"
      >
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Icon name="signal" className="w-10 h-10 mb-2 text-slate-300" />
            <p className="text-sm">Waiting for events...</p>
            <p className="text-xs mt-1">Guardrail interventions will appear here in real-time</p>
          </div>
        ) : (
          filteredEvents.map(event => {
            const typeStyle = getEventTypeStyle(event.eventType);
            const sevStyle = getSeverityStyle(event.severity);

            return (
              <div
                key={event.id}
                className={`p-3 rounded-xl border ${typeStyle.border} ${typeStyle.bg} animate-fade-in`}
              >
                <div className="flex items-start gap-3">
                  {/* Severity Indicator */}
                  <div className="relative">
                    <div className={`w-3 h-3 rounded-full ${sevStyle.bg} ${sevStyle.pulse ? 'animate-pulse' : ''}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${typeStyle.bg} ${typeStyle.text}`}>
                        {event.eventType}
                      </span>
                      <Icon name={getRuleTypeIcon(event.ruleType)} className="w-4 h-4" />
                      <span className="text-xs font-medium text-slate-700">{event.ruleName}</span>
                      <span className="text-[10px] text-slate-400">{formatTime(event.timestamp)}</span>
                    </div>

                    <div className="flex items-center gap-4 text-[10px] text-slate-500 mb-2">
                      <span className="flex items-center gap-1"><Icon name="cpu-chip" className="w-3 h-3" /> {event.agentName}</span>
                      <span className="flex items-center gap-1"><Icon name="shield-check" className="w-3 h-3" /> {event.guardrailName}</span>
                      <span>{(event.confidence * 100).toFixed(0)}% confidence</span>
                      <span>{event.latencyMs}ms</span>
                    </div>

                    {event.inputPreview && (
                      <div className="p-2 bg-white/50 rounded-lg text-xs text-slate-600 font-mono truncate">
                        {event.inputPreview}
                      </div>
                    )}

                    {event.matchedContent && (
                      <div className="mt-1 text-[10px] text-slate-500">
                        Matched: <code className="bg-white/50 px-1 rounded">{event.matchedContent}</code>
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
  );
}
