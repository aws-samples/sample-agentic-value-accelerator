// SessionHistory.tsx — the conversation history panel, upgraded to a research-log feel:
// sessions are grouped by date (Today / Yesterday / This week / …), searchable, and each row
// shows derived metadata (tools exercised + the winning-portfolio headline when one was built),
// not just a chat title. Pure presentation over the localStorage-backed records the App owns.

import { useMemo, useState } from 'react';
import { History, Trash2, Search, Dna, Wrench, ChevronDown, ChevronUp } from 'lucide-react';
import type { SessionRecord } from './lib/sessions';
import { relativeTime, groupByDate, matchesQuery } from './lib/sessions';
import { cn } from './lib/cn';

// Keep the left rail from growing unbounded: when not searching, show only the most
// recent few and tuck the rest behind a "Show more" toggle. The active session is
// always kept visible even if it'd otherwise be collapsed away.
const COLLAPSED_LIMIT = 5;

export function SessionHistory({
  sessions,
  activeId,
  onResume,
  onDelete,
  onClear,
  nowMs,
}: {
  sessions: SessionRecord[];
  activeId: string;
  onResume: (rec: SessionRecord) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  nowMs: number;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);

  const searching = !!query.trim();

  // Sessions that match the search (or all of them). Newest-first already.
  const matched = useMemo(
    () => (searching ? sessions.filter((s) => matchesQuery(s, query)) : sessions),
    [sessions, query, searching],
  );

  // When collapsed (and not searching), show only the most-recent few — but always
  // keep the active session visible so the user never loses their current thread.
  const hiddenCount = !searching && !expanded ? Math.max(0, matched.length - COLLAPSED_LIMIT) : 0;
  const visible = useMemo(() => {
    if (searching || expanded || matched.length <= COLLAPSED_LIMIT) return matched;
    const head = matched.slice(0, COLLAPSED_LIMIT);
    if (!head.some((s) => s.id === activeId)) {
      const act = matched.find((s) => s.id === activeId);
      if (act) head.push(act); // pin the active session even if it's further down
    }
    return head;
  }, [matched, searching, expanded, activeId]);

  const groups = useMemo(() => groupByDate(visible, nowMs), [visible, nowMs]);

  if (!sessions.length) {
    return (
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        No past conversations yet. Sessions you run are saved here on this device.
      </p>
    );
  }

  const totalShown = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <History className="size-3" />
          {sessions.length} saved
        </span>
        {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
        <button
          onClick={onClear}
          className="text-[10.5px] font-medium text-muted-foreground transition-colors hover:text-destructive"
        >
          Clear all
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search conversations…"
          className="w-full rounded-lg border border-border bg-elevated py-1.5 pl-7 pr-2 text-[12px] text-foreground placeholder:text-muted-foreground shadow-sm transition-colors hover:border-primary/40 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* nosemgrep: jsx-not-internationalized (single-locale demo) */}
      {query.trim() && totalShown === 0 && (
        <p className="px-1 text-[11px] text-muted-foreground">No matches for “{query.trim()}”.</p>
      )}

      {groups.map((g) => (
        <div key={g.bucket} className="flex flex-col gap-1.5">
          <div className="field-key mt-1 text-[9.5px] text-muted-foreground/70">{g.bucket}</div>
          {g.items.map((s) => {
            const active = s.id === activeId;
            const meta = s.meta;
            return (
              <div
                key={s.id}
                className={cn(
                  'group flex items-start gap-2 rounded-lg border bg-elevated px-2.5 py-2 shadow-sm transition-colors',
                  active
                    ? 'border-primary/50 border-l-[3px] border-l-primary'
                    : 'border-border hover:border-primary/40',
                )}
              >
                <button
                  onClick={() => onResume(s)}
                  className="flex min-w-0 flex-1 flex-col items-start text-left"
                  title={meta?.preview || s.title}
                >
                  <span className="w-full truncate text-[12.5px] font-medium text-foreground">
                    {s.title}
                  </span>

                  {/* Winning-portfolio headline — the research-log payoff. */}
                  {meta?.builtPortfolio && meta.winnerYield != null && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      <Dna className="size-2.5" />
                      built · {meta.winnerYield.toFixed(2)}% yld
                      {meta.winnerDuration != null && ` · ${meta.winnerDuration.toFixed(1)}y dur`}
                    </span>
                  )}

                  {/* Tool chips (distinct domain tools exercised). */}
                  {meta?.tools && meta.tools.length > 0 && (
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      <Wrench className="size-2.5 text-muted-foreground" />
                      {meta.tools.slice(0, 5).map((t) => (
                        <span key={t} className="rounded bg-secondary px-1 py-px text-[9.5px] font-mono text-muted-foreground">
                          {t}
                        </span>
                      ))}
                    </span>
                  )}

                  <span className="mt-1 text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground">
                    {meta?.turnCount ?? s.turns.filter((t) => t.role !== 'system').length} msg ·{' '}
                    {relativeTime(s.updatedAt, nowMs)}
                    {active && <span className="text-primary"> · current</span>}
                  </span>
                </button>
                <button
                  onClick={() => onDelete(s.id)}
                  title="Delete session"
                  className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ))}

      {/* Collapse toggle — only when not searching and there's an overflow to hide. */}
      {!searching && (hiddenCount > 0 || expanded) && matched.length > COLLAPSED_LIMIT && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 flex items-center justify-center gap-1 rounded-lg border border-dashed border-border py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              Show {hiddenCount} more
            </>
          )}
        </button>
      )}
    </div>
  );
}
