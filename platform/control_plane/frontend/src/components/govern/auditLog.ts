/**
 * auditLog — shared audit / decision store for the Govern module.
 *
 * Backend-first with graceful mock fallback (mirrors useAgentRegistry's
 * live-or-mock pattern): on first use we fetch the append-only audit log from
 * the control-plane backend (GET /govern/audit/events). If the backend is
 * unreachable or the table isn't provisioned (local dev), we fall back to the
 * static mock seed so the demo still works offline.
 *
 * Appends (e.g. a Handoff Workspace decision) POST to the backend; on success
 * we prepend the persisted event to the local snapshot; on failure we still
 * prepend locally (and persist to sessionStorage) so the demo UX never blocks.
 *
 * Security: Uses sessionStorage (not sessionStorage) so actor names are not
 * persisted beyond the browser session.
 *
 * Exposed via useSyncExternalStore so any mounted view (Audit & Incidents,
 * Handoff Workspace) sees the same live stream.
 */
import { useSyncExternalStore } from 'react';
import { AUDIT_EVENTS, type AuditEvent } from './mockData';
import { governAuditApi, type GovernAuditEventCreate } from '../../api/client';

const STORAGE_KEY = 'ava_govern_audit_appended';

function loadAppended(): AuditEvent[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuditEvent[]) : [];
  } catch {
    return [];
  }
}

// Locally-appended events (offline fallback / optimistic), newest-first.
let appended: AuditEvent[] = loadAppended();
// Events fetched from the backend, newest-first. Empty until a successful fetch.
let remote: AuditEvent[] = [];
// Have we successfully loaded from the backend? Drives seed-vs-remote base.
let remoteLoaded = false;
let loading = false;

const listeners = new Set<() => void>();

function computeSnapshot(): AuditEvent[] {
  // Base is the backend log once loaded; otherwise the static mock seed.
  const base = remoteLoaded ? remote : AUDIT_EVENTS;
  // De-dupe by id so an optimistically-appended event isn't shown twice after
  // it also comes back from the backend on a later refresh.
  const seen = new Set(base.map(e => e.id));
  const extras = appended.filter(e => !seen.has(e.id));
  return [...extras, ...base];
}

let snapshot: AuditEvent[] = computeSnapshot();

function emit() {
  snapshot = computeSnapshot();
  listeners.forEach(l => l());
}

/** Fetch the audit log from the backend once; fall back to mock on failure. */
async function loadRemote(): Promise<void> {
  if (remoteLoaded || loading) return;
  loading = true;
  try {
    const events = await governAuditApi.list();
    remote = events as AuditEvent[];
    remoteLoaded = true;
    // Clear sessionStorage-buffered appends that are now durably in the backend.
    appended = appended.filter(a => !remote.some(r => r.id === a.id));
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(appended)); } catch { /* noop */ }
    emit();
  } catch {
    // Backend offline or table missing — stay on the mock seed. Non-fatal.
  } finally {
    loading = false;
  }
}

/** Append an audit event: POST to backend, optimistically update locally. */
export async function appendAuditEvent(event: AuditEvent): Promise<void> {
  // Optimistic: show it immediately (and buffer to sessionStorage as a fallback).
  appended = [event, ...appended];
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(appended)); } catch { /* noop */ }
  emit();

  // Persist to backend. On success, replace the optimistic entry with the
  // server-assigned record (canonical id/ts).
  try {
    const payload: GovernAuditEventCreate = {
      category: event.category,
      severity: event.severity,
      actor: event.actor,
      summary: event.summary,
      action: event.action,
      agent: event.agent,
      evidence: event.evidence,
      decisionContext: event.decisionContext,
    };
    const saved = await governAuditApi.append(payload);
    appended = appended.map(a => (a.id === event.id ? (saved as AuditEvent) : a));
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(appended)); } catch { /* noop */ }
    emit();
  } catch {
    // Backend unavailable — the optimistic local entry stays. Demo unaffected.
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // Kick off a backend load the first time anything subscribes.
  void loadRemote();
  return () => listeners.delete(cb);
}

function getSnapshot(): AuditEvent[] {
  return snapshot;
}

function getIsLive(): boolean {
  return remoteLoaded;
}

/** All audit events: locally-appended (newest first) + backend log or mock seed. */
export function useAuditEvents(): AuditEvent[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Returns true if events are from the live backend, false if using mock fallback. */
export function useIsAuditLive(): boolean {
  return useSyncExternalStore(subscribe, getIsLive, getIsLive);
}
