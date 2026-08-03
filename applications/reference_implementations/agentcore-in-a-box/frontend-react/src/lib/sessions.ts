// sessions.ts — client-side conversation history. There is NO server-side raw-turn
// store in this stack (the agent's _sessions dict is ephemeral/legacy; AgentCore Memory
// keeps only summarized facts, not replayable transcripts), so "see old sessions" is
// implemented purely in localStorage. This keeps the FROZEN transport/auth files and the
// backend untouched. Each browser sees only its own history.

import type { TimelineItem } from '../agentClient';

export type StoredTurn = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timeline: TimelineItem[];
};

/** Derived, denormalized summary of a session so the history reads like a research log
 * (mandate + result), not just a chat title. Computed from the turns at save time. */
export type SessionMeta = {
  turnCount: number;          // user/assistant messages
  toolCount: number;          // domain tool calls across the session
  tools: string[];            // distinct domain tool names exercised (short)
  builtPortfolio: boolean;    // did an evolve_portfolio run complete?
  winnerYield?: number;       // winning-portfolio yield (%), if built
  winnerDuration?: number;    // winning-portfolio duration (y), if built
  preview?: string;           // first user message, lightly trimmed
};

export type SessionRecord = {
  id: string; // the threadId
  title: string;
  updatedAt: number; // epoch ms
  turns: StoredTurn[];
  meta?: SessionMeta;
};

const KEY = 'meridian-sessions';
const MAX_SESSIONS = 20;
const MAX_TURNS_PER_SESSION = 60; // keep storage bounded

/** Read all saved sessions, newest first. Never throws. */
export function listSessions(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return (arr as SessionRecord[])
      .filter((s) => s && typeof s.id === 'string' && Array.isArray(s.turns))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch {
    return [];
  }
}

/** Derive a short human title from the first user message (or a timestamp). */
export function titleFor(turns: StoredTurn[], nowMs: number): string {
  const firstUser = turns.find((t) => t.role === 'user' && t.text.trim());
  if (firstUser) {
    const s = firstUser.text.trim().replace(/\s+/g, ' ');
    return s.length > 48 ? s.slice(0, 48) + '…' : s;
  }
  try {
    return new Date(nowMs).toLocaleString();
  } catch {
    return 'Session';
  }
}

// Short labels for the FI/AgentCore tools, used in the history meta chips. Reads the
// smuggled __tool key from each tool-call's args (same channel the rails read).
const TOOL_SHORT: Record<string, string> = {
  evolve_portfolio: 'evolve', portfolio_risk: 'risk', bond_screen: 'screen',
  curve_lookup: 'curve', spread_lookup: 'spreads', price_bond: 'price',
  code_interpreter: 'code', web_browser: 'browser', secure_vault: 'vault',
  user_data_lookup: 'profile', positions_view: 'positions', trade_execute: 'trade',
};

function _parseArgs(s?: string): any {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Compute the denormalized session summary from its turns (mandate + result + tools). */
export function summarize(turns: StoredTurn[]): SessionMeta {
  const tools = new Set<string>();
  let toolCount = 0;
  let builtPortfolio = false;
  let winnerYield: number | undefined;
  let winnerDuration: number | undefined;

  for (const t of turns) {
    for (const item of t.timeline || []) {
      const p = _parseArgs(item.args);
      if (!p || typeof p !== 'object') continue;
      const tool = String(p.__tool || '');
      if (!tool || tool === 'agent_active' || tool === 'handoff' || p.__handoff || p.__agent_active) continue;
      toolCount += 1;
      if (TOOL_SHORT[tool]) tools.add(TOOL_SHORT[tool]);
      // Pull the winning-portfolio headline from a completed evolve result.
      if (tool === 'evolve_portfolio' && item.result) {
        const res = _parseArgs(item.result);
        const m = res?.winner?.metrics;
        if (m && typeof m.yield === 'number') {
          builtPortfolio = true;
          winnerYield = m.yield;
          winnerDuration = typeof m.duration === 'number' ? m.duration : winnerDuration;
        }
      }
    }
  }
  const firstUser = turns.find((t) => t.role === 'user' && t.text.trim());
  const preview = firstUser
    ? firstUser.text.trim().replace(/\s+/g, ' ').slice(0, 120)
    : undefined;
  return {
    turnCount: turns.filter((t) => t.role !== 'system').length,
    toolCount,
    tools: Array.from(tools),
    builtPortfolio,
    winnerYield,
    winnerDuration,
    preview,
  };
}

/** Upsert a session by id. No-op for empty conversations. Never throws. Computes the
 * denormalized meta (mandate + result + tools) here so every call site gets it. */
export function saveSession(rec: SessionRecord): void {
  try {
    if (!rec.id || !rec.turns?.length) return;
    const turns = rec.turns.slice(-MAX_TURNS_PER_SESSION);
    const trimmed: SessionRecord = {
      ...rec,
      turns,
      meta: summarize(turns),
    };
    const all = listSessions().filter((s) => s.id !== rec.id);
    all.unshift(trimmed);
    const capped = all
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, MAX_SESSIONS);
    localStorage.setItem(KEY, JSON.stringify(capped));
  } catch {
    /* storage full / unavailable — history is best-effort */
  }
}

/** Remove one session by id. */
export function deleteSession(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(listSessions().filter((s) => s.id !== id)));
  } catch {
    /* ignore */
  }
}

/** Wipe all saved sessions. */
export function clearSessions(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Compact relative-time label, e.g. "just now", "5m ago", "2h ago", "3d ago". */
export function relativeTime(ms: number, nowMs: number): string {
  const d = Math.max(0, nowMs - ms);
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

/** Bucket a timestamp into a human date group relative to now. */
export function dateBucket(ms: number, nowMs: number): string {
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const today = startOfDay(nowMs);
  const day = 86400000;
  if (ms >= today) return 'Today';
  if (ms >= today - day) return 'Yesterday';
  if (ms >= today - 7 * day) return 'This week';
  if (ms >= today - 30 * day) return 'This month';
  return 'Older';
}

const BUCKET_ORDER = ['Today', 'Yesterday', 'This week', 'This month', 'Older'];

/** Case-insensitive match of a query against a session's title, preview, and tool chips. */
export function matchesQuery(s: SessionRecord, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [s.title, s.meta?.preview || '', ...(s.meta?.tools || [])].join(' ').toLowerCase();
  return hay.includes(needle);
}

/** Group sessions (already newest-first) into ordered date buckets for the history panel. */
export function groupByDate(
  sessions: SessionRecord[],
  nowMs: number,
): { bucket: string; items: SessionRecord[] }[] {
  const map = new Map<string, SessionRecord[]>();
  for (const s of sessions) {
    const b = dateBucket(s.updatedAt || 0, nowMs);
    (map.get(b) || map.set(b, []).get(b)!).push(s);
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ bucket: b, items: map.get(b)! }));
}
