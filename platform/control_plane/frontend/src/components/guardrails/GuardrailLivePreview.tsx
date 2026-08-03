import { useState, useEffect, useMemo } from 'react';
import { Icon } from '../govern/icons';
import type { ContentFilterConfig, PiiEntityConfig, DeniedTopic, WordFilterConfig, ContextualGroundingConfig, GuardrailFilterType } from '../../types';

interface Props {
  contentFilters: ContentFilterConfig[];
  piiEntities: PiiEntityConfig[];
  deniedTopics: DeniedTopic[];
  wordFilter: WordFilterConfig;
  contextualGrounding: ContextualGroundingConfig;
}

interface TextSegment {
  text: string;
  type: 'normal' | 'pii' | 'content' | 'topic' | 'word' | 'grounding';
  category?: string;
  redacted?: string;
}

// Sample messages that contain various sensitive content
const SAMPLE_MESSAGES = [
  {
    role: 'user' as const,
    text: `Hi, I need help transferring funds. My credit card number is 4532-8901-2345-6789 and my SSN is 123-45-6789. The routing number is 021000021. Please send $50,000 to account 9876543210.`,
    avatar: 'U',
  },
  {
    role: 'assistant' as const,
    text: `I'd be happy to help with your transfer. I can see your card ending in 6789. Let me also confirm — your email is john.smith@examplebank.com and your phone is (555) 234-8901, correct? I'll process the wire to the recipient's account.`,
    avatar: 'A',
  },
  {
    role: 'user' as const,
    text: `Yes that's right. Also, can you give me some investment advice? I heard insider information about ACME Corp's upcoming merger — should I buy their stock before the announcement? What's a good way to manipulate the market?`,
    avatar: 'U',
  },
  {
    role: 'assistant' as const,
    text: `I can help with general investment guidance. Based on your portfolio, diversified index funds have historically performed well. I'd recommend consulting with a certified financial advisor for personalized recommendations tailored to your risk tolerance and goals.`,
    avatar: 'A',
  },
];

// PII patterns with their entity types
const PII_PATTERNS: { pattern: RegExp; entity: string; category: string; redactedLabel: string }[] = [
  { pattern: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g, entity: 'CREDIT_DEBIT_CARD_NUMBER', category: 'Financial', redactedLabel: '[CARD ████████]' },
  { pattern: /\d{3}[-\s]?\d{2}[-\s]?\d{4}/g, entity: 'US_SOCIAL_SECURITY_NUMBER', category: 'Personal', redactedLabel: '[SSN ████]' },
  { pattern: /\d{9,12}(?=\b)/g, entity: 'US_BANK_ROUTING_NUMBER', category: 'Financial', redactedLabel: '[ROUTING ████]' },
  { pattern: /account\s*\d{7,12}/gi, entity: 'FINANCE_ACCOUNT_NUMBER', category: 'Financial', redactedLabel: '[ACCOUNT ████]' },
  { pattern: /\$[\d,]+(?:\.\d{2})?/g, entity: 'FINANCE_AMOUNT', category: 'Financial', redactedLabel: '[AMOUNT ████]' },
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, entity: 'EMAIL', category: 'Personal', redactedLabel: '[EMAIL ████]' },
  { pattern: /\(\d{3}\)\s*\d{3}[-\s]?\d{4}/g, entity: 'PHONE', category: 'Personal', redactedLabel: '[PHONE ████]' },
];

// Content that would be caught by content filters
const CONTENT_TRIGGERS: { pattern: RegExp; filterType: GuardrailFilterType; label: string }[] = [
  { pattern: /manipulate the market/gi, filterType: 'MISCONDUCT', label: 'Market Manipulation' },
];

// Topic triggers
const TOPIC_TRIGGERS: { pattern: RegExp; topicKeywords: string[]; label: string }[] = [
  { pattern: /insider information.*merger.*buy.*stock.*before the announcement/gi, topicKeywords: ['insider trading', 'insider information', 'market manipulation'], label: 'Insider Trading' },
  { pattern: /insider information about.*upcoming merger/gi, topicKeywords: ['insider trading', 'insider information'], label: 'Insider Trading' },
];

function getTypeColor(type: TextSegment['type']): { bg: string; text: string; border: string } {
  switch (type) {
    case 'pii': return { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' };
    case 'content': return { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' };
    case 'topic': return { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' };
    case 'word': return { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200' };
    case 'grounding': return { bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200' };
    default: return { bg: '', text: '', border: '' };
  }
}

export default function GuardrailLivePreview({ contentFilters, piiEntities, deniedTopics, wordFilter, contextualGrounding }: Props) {
  const [isVisible, setIsVisible] = useState(true);
  const [animatingSegments, setAnimatingSegments] = useState<Set<string>>(new Set());

  // Track previously active entities to detect new additions
  const [prevActiveCount, setPrevActiveCount] = useState(0);

  const activeEntityTypes = useMemo(() => new Set(piiEntities.map(e => e.type)), [piiEntities]);
  const activeFilterTypes = useMemo(() => new Set(contentFilters.map(f => f.type)), [contentFilters]);
  const activeTopicKeywords = useMemo(() => {
    const keywords: string[] = [];
    deniedTopics.forEach(t => {
      keywords.push(t.name.toLowerCase());
      t.examples?.forEach(ex => keywords.push(ex.toLowerCase()));
    });
    return keywords;
  }, [deniedTopics]);
  const blockedWords = useMemo(() => wordFilter.blocked_words.map(w => w.toLowerCase()), [wordFilter.blocked_words]);

  const currentActiveCount = activeEntityTypes.size + activeFilterTypes.size + activeTopicKeywords.length + blockedWords.length + (contextualGrounding.enabled ? 1 : 0);

  useEffect(() => {
    if (currentActiveCount > prevActiveCount) {
      // Something new was added — trigger animation
      const id = `anim-${Date.now()}`;
      setAnimatingSegments(prev => new Set(prev).add(id));
      setTimeout(() => {
        setAnimatingSegments(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 600);
    }
    setPrevActiveCount(currentActiveCount);
  }, [currentActiveCount, prevActiveCount]);

  // Process a message and return segments
  const processMessage = (text: string): TextSegment[] => {
    // Build a list of ranges to highlight
    const ranges: { start: number; end: number; type: TextSegment['type']; category?: string; redacted?: string }[] = [];

    // Check PII patterns
    PII_PATTERNS.forEach(({ pattern, entity, category, redactedLabel }) => {
      if (!activeEntityTypes.has(entity)) return;
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(text)) !== null) {
        ranges.push({ start: match.index, end: match.index + match[0].length, type: 'pii', category, redacted: redactedLabel });
      }
    });

    // Check content filter triggers
    CONTENT_TRIGGERS.forEach(({ pattern, filterType, label }) => {
      if (!activeFilterTypes.has(filterType)) return;
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(text)) !== null) {
        ranges.push({ start: match.index, end: match.index + match[0].length, type: 'content', category: label });
      }
    });

    // Check topic triggers
    TOPIC_TRIGGERS.forEach(({ pattern, topicKeywords, label }) => {
      const hasMatchingTopic = topicKeywords.some(kw => activeTopicKeywords.includes(kw));
      if (!hasMatchingTopic) return;
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(text)) !== null) {
        ranges.push({ start: match.index, end: match.index + match[0].length, type: 'topic', category: label });
      }
    });

    // Check blocked words
    blockedWords.forEach(word => {
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        ranges.push({ start: match.index, end: match.index + match[0].length, type: 'word', category: word });
      }
    });

    // Sort ranges by start position and remove overlaps
    ranges.sort((a, b) => a.start - b.start);
    const merged: typeof ranges = [];
    for (const r of ranges) {
      if (merged.length === 0 || r.start >= merged[merged.length - 1].end) {
        merged.push(r);
      }
    }

    // Build segments
    const segments: TextSegment[] = [];
    let cursor = 0;
    for (const range of merged) {
      if (range.start > cursor) {
        segments.push({ text: text.slice(cursor, range.start), type: 'normal' });
      }
      segments.push({
        text: text.slice(range.start, range.end),
        type: range.type,
        category: range.category,
        redacted: range.redacted,
      });
      cursor = range.end;
    }
    if (cursor < text.length) {
      segments.push({ text: text.slice(cursor), type: 'normal' });
    }

    return segments;
  };

  const hasAnyGuardrails = currentActiveCount > 0;
  const isAnimating = animatingSegments.size > 0;

  return (
    <div className="card !p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Live Preview</h3>
          {hasAnyGuardrails && (
            <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded-full">
              {currentActiveCount} rule{currentActiveCount !== 1 ? 's' : ''} active
            </span>
          )}
        </div>
        <button
          onClick={() => setIsVisible(!isVisible)}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          {isVisible ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {isVisible && (
        <div className="p-5 space-y-4">
          {/* Info banner */}
          {!hasAnyGuardrails && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/60">
              <svg className="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-xs text-slate-500">Enable guardrail features below to see how they protect against sensitive data in this sample conversation.</p>
            </div>
          )}

          {/* Sample conversation */}
          <div className="space-y-3">
            {SAMPLE_MESSAGES.map((msg, i) => {
              const segments = processMessage(msg.text);
              const hasRedactions = segments.some(s => s.type !== 'normal');

              return (
                <div key={i} className={`flex gap-3 ${msg.role === 'assistant' ? 'pl-4' : ''}`}>
                  {/* Avatar */}
                  <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                    msg.role === 'user'
                      ? 'bg-slate-200 text-slate-600'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {msg.avatar}
                  </div>

                  {/* Message */}
                  <div className={`flex-1 rounded-xl px-4 py-3 text-sm leading-relaxed transition-all duration-300 ${
                    msg.role === 'user'
                      ? 'bg-slate-50 border border-slate-200/60'
                      : 'bg-blue-50/40 border border-blue-100/60'
                  } ${hasRedactions && isAnimating ? 'ring-2 ring-blue-200 ring-opacity-50' : ''}`}>
                    {/* Render segments */}
                    <span>
                      {segments.map((seg, j) => {
                        if (seg.type === 'normal') {
                          return <span key={j}>{seg.text}</span>;
                        }

                        const colors = getTypeColor(seg.type);

                        return (
                          <span
                            key={j}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${colors.bg} border ${colors.border} transition-all duration-500 animate-fade-in`}
                            title={`${seg.type.toUpperCase()}: ${seg.category || seg.text}`}
                          >
                            {seg.type === 'pii' ? (
                              <>
                                <span className={`font-mono text-xs ${colors.text} font-medium`}>{seg.redacted}</span>
                              </>
                            ) : seg.type === 'content' || seg.type === 'topic' ? (
                              <>
                                <svg className={`w-3 h-3 ${colors.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                                <span className={`text-xs ${colors.text} line-through decoration-2`}>{seg.text}</span>
                              </>
                            ) : (
                              <>
                                <span className={`text-xs ${colors.text} line-through decoration-2`}>{seg.text}</span>
                              </>
                            )}
                          </span>
                        );
                      })}
                    </span>

                    {/* Redaction summary badge */}
                    {hasRedactions && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {segments.filter(s => s.type !== 'normal').map((seg, j) => {
                          const colors = getTypeColor(seg.type);
                          return (
                            <span key={j} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase ${colors.bg} ${colors.text} border ${colors.border}`}>
                              {seg.type === 'pii' && <Icon name="lock-closed" className="w-2.5 h-2.5" />}
                              {seg.type === 'content' && <Icon name="shield-check" className="w-2.5 h-2.5" />}
                              {seg.type === 'topic' && <Icon name="no-symbol" className="w-2.5 h-2.5" />}
                              {seg.type === 'word' && <Icon name="chat-bubble" className="w-2.5 h-2.5" />}
                              {seg.category}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Contextual grounding indicator */}
          {contextualGrounding.enabled && (
            <div className="flex items-center gap-2 p-3 bg-teal-50 border border-teal-200 rounded-xl animate-fade-in">
              <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-xs font-medium text-teal-800">Contextual Grounding Active</p>
                <p className="text-[10px] text-teal-600">Responses verified against source (threshold: {contextualGrounding.grounding_threshold}) &middot; Relevance check ({contextualGrounding.relevance_threshold})</p>
              </div>
            </div>
          )}

          {/* Legend */}
          {hasAnyGuardrails && (
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Legend:</span>
              {activeEntityTypes.size > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-amber-700">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-200 border border-amber-300" />
                  PII Redacted
                </span>
              )}
              {activeFilterTypes.size > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-red-700">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-200 border border-red-300" />
                  Content Blocked
                </span>
              )}
              {activeTopicKeywords.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-purple-700">
                  <span className="w-2.5 h-2.5 rounded-sm bg-purple-200 border border-purple-300" />
                  Topic Denied
                </span>
              )}
              {blockedWords.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-orange-700">
                  <span className="w-2.5 h-2.5 rounded-sm bg-orange-200 border border-orange-300" />
                  Word Filtered
                </span>
              )}
              {contextualGrounding.enabled && (
                <span className="flex items-center gap-1 text-[10px] text-teal-700">
                  <span className="w-2.5 h-2.5 rounded-sm bg-teal-200 border border-teal-300" />
                  Grounding Check
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
