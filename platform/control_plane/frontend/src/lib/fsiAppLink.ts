// AVA -> FSI Foundry app SSO handoff.
// Asks the AVA backend to mint a short-lived HMAC-signed handoff token
// (backend RS256-verifies the caller's Cognito id_token first), then opens
// the FSI app URL with ?ava_token=<blob>. The app's CloudFront edge
// verifies the HMAC, sets an ava_session cookie, and 302s to strip the
// token from the URL. No user re-login required.

import { CognitoUserPool } from 'amazon-cognito-identity-js';

async function currentCognitoIdToken(): Promise<string | null> {
  const poolId = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
  if (!poolId || !clientId) return null;

  const pool = new CognitoUserPool({ UserPoolId: poolId, ClientId: clientId });
  const user = pool.getCurrentUser();
  if (!user) return null;

  return new Promise<string | null>((resolve) => {
    user.getSession((_err: Error | null, session: unknown) => {
      const s = session as { getIdToken?: () => { getJwtToken: () => string } } | null;
      resolve(s?.getIdToken?.().getJwtToken() ?? null);
    });
  });
}

async function fetchHandoffToken(): Promise<string | null> {
  const idToken = await currentCognitoIdToken();
  if (!idToken) return null;

  const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
  try {
    const resp = await fetch(`${apiBase}/api/v1/fsi/sign-app-token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!resp.ok) return null;
    const body = await resp.json();
    return body.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Open an FSI Foundry app URL with an SSO handoff token appended.
 * Falls back to opening the URL unmodified if:
 *  - Cognito isn't configured (dev mode)
 *  - No active AVA session
 *  - Backend didn't mint a token (endpoint disabled or errored)
 * In the fallback case, the app's CloudFront edge will 302 to the AVA
 * login page if edge auth is enforced.
 */
export async function openFsiApp(url: string | undefined | null): Promise<void> {
  if (!url) return;

  const token = await fetchHandoffToken();
  if (!token) {
    window.open(url, '_blank');
    return;
  }

  const sep = url.includes('?') ? '&' : '?';
  window.open(`${url}${sep}ava_token=${encodeURIComponent(token)}`, '_blank');
}

/**
 * Return the given URL with an SSO handoff token appended as ?ava_token=...,
 * suitable for use as an iframe src or an <a href>. Falls back to the raw
 * URL if a token can't be minted (same conditions as openFsiApp).
 *
 * Use this when you need the URL as a string (iframe/link) rather than
 * navigating to it. For programmatic navigation, prefer openFsiApp().
 */
export async function withAvaToken(url: string | undefined | null): Promise<string | undefined> {
  if (!url) return url ?? undefined;
  const token = await fetchHandoffToken();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}ava_token=${encodeURIComponent(token)}`;
}
