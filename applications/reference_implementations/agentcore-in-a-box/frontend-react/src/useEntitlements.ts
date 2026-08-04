/**
 * useEntitlements — gives any screen the CALLER's live effective entitlements.
 *
 * Two update paths, so the UI is both correct-on-load and instant-on-change:
 *   1. Fetch /me/entitlements on mount (authoritative baseline).
 *   2. Open a PERSISTENT WebSocket (the same API Gateway WS used for chat) so an admin's
 *      grant/revoke — which the admin-api pushes as an `entitlements_changed` frame to this
 *      user's live connections — re-renders the UI within ~1s. Server-side enforcement is
 *      already live on the user's very next turn regardless; this is the visible feedback.
 *
 * The persistent socket registers in the connections table (keyed by userId on $connect), which
 * is exactly what the admin-api scans to find who to push to. It ignores chat frames — chat runs
 * on its own transient sockets in AgentClient.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Auth, AppConfig } from './auth';
import { entitlementsApi, isAdminFromToken, type Effective } from './entitlements';

export interface EntitlementsState {
  effective: Effective | null;
  isAdmin: boolean;
  loading: boolean;
  error: string;
  /** Bumps on every change (fetch or push) so consumers can flash a "your access changed" toast. */
  version: number;
  refresh: () => void;
}

export function useEntitlements(
  auth: Auth, cfg: AppConfig, authed: boolean,
  /** Optional sink for push frames this hook doesn't own (e.g. access_request_* frames the
   * request/approve workflow raises). Kept in a ref so passing a fresh closure never
   * reconnects the socket. */
  onFrame?: (frame: any) => void,
): EntitlementsState {
  const [effective, setEffective] = useState<Effective | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const refresh = useCallback(async () => {
    if (!authed) return;
    try {
      const me = await entitlementsApi.me(auth, cfg);
      setEffective(me.entitlements);
      setIsAdmin(me.is_admin);
      setError('');
      setVersion((v) => v + 1);
    } catch (e: any) {
      setError(e?.message || 'Failed to load entitlements');
      // Resilience: if /me is unreachable, still surface the admin gate from the verified ID
      // token's cognito:groups so the admin shell renders (the backend re-checks every route
      // regardless). This also lets the dev harness (/dev.html?admin=1) preview the admin UI.
      try { setIsAdmin(isAdminFromToken(auth)); } catch { /* noop */ }
    } finally {
      setLoading(false);
    }
  }, [auth, cfg, authed]);

  // Baseline fetch on auth.
  useEffect(() => {
    if (authed) { setLoading(true); refresh(); }
  }, [authed, refresh]);

  // Persistent push socket. Reconnects with backoff; refetches on any entitlements_changed.
  useEffect(() => {
    if (!authed || !cfg.WS_URL) return;
    closedRef.current = false;

    const connect = () => {
      if (closedRef.current) return;
      const token = auth.getAccessToken() || '';
      if (!token) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${cfg.WS_URL}?token=${encodeURIComponent(token)}`);
      } catch {
        retryRef.current = setTimeout(connect, 5000);
        return;
      }
      wsRef.current = ws;
      ws.onmessage = (evt) => {
        let frame: any;
        try { frame = JSON.parse(evt.data); } catch { return; }
        if (frame?.type === 'entitlements_changed') {
          if (frame.entitlements) {
            setEffective(frame.entitlements);
            setVersion((v) => v + 1);
          } else {
            refresh();
          }
        } else {
          // Hand any other frame (e.g. access_request_created / access_request_resolved) to the
          // optional sink so the request/approve workflow can surface toasts + a pending badge.
          try { onFrameRef.current?.(frame); } catch { /* noop */ }
        }
      };
      ws.onclose = () => {
        if (!closedRef.current) retryRef.current = setTimeout(connect, 5000);
      };
      ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
    };
    connect();

    return () => {
      closedRef.current = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      try { wsRef.current?.close(); } catch { /* noop */ }
    };
  }, [authed, cfg.WS_URL, auth, refresh]);

  return { effective, isAdmin, loading, error, version, refresh };
}
