/**
 * AVA FSI SSO — client-side helpers.
 *
 * Companion of the CloudFront Function
 * (infrastructure/modules/cloudfront/ava_sso_function.js.tftpl) that gates
 * the market-surveillance CloudFront distribution when the AVA control
 * plane's fsi_app_signing_secret is wired in. On first hop from the AVA
 * UI's Open-App button, the Function verifies the ?ava_token=<HMAC blob>,
 * strips it from the URL, and sets an ava_session cookie. This module
 * exposes two hooks the rest of the app uses:
 *
 *  1. `avaAuthHeaders()` — returns `{Authorization: "Bearer <cookie>"}`
 *     when the ava_session cookie is present, else `{}`. Called by the
 *     API client so AVA-federated requests carry the HMAC token to the
 *     API Gateway (which today verifies Cognito, so the UI's `apiClient`
 *     falls back to Amplify's id_token when the AVA cookie is absent —
 *     see comment on `hasAvaSession` below).
 *
 *  2. `hasAvaSession()` — true if the ava_session cookie exists on
 *     document.cookie. Used by the login page to skip the form when the
 *     user has already been federated in from the AVA UI.
 *
 * Note on backend auth today: the API Gateway is still Cognito-authorized
 * (see infrastructure/modules/api-gateway/main.tf). This module ONLY makes
 * the login page invisible when the user arrives with a valid
 * ava_session cookie — the app then falls through to Amplify's Cognito
 * session, which the deploy pre-provisions on the same user pool. If we
 * later add a dual-token Lambda authorizer that accepts AVA HMAC OR
 * Cognito JWT, the UI's Authorization header will already be correct
 * because avaAuthHeaders() prefers the AVA cookie.
 *
 * The cookie is Secure+SameSite=Lax (set by the CloudFront Function),
 * NOT HttpOnly, because we intentionally need JS to read it here. If we
 * later flip it to HttpOnly, add a same-origin GET endpoint that echoes
 * the verified token.
 */

function readCookie(name: string): string {
    if (typeof document === 'undefined') return '';
    const prefix = `${name}=`;
    for (const part of document.cookie.split(';')) {
        const trimmed = part.trim();
        if (trimmed.startsWith(prefix)) {
            return trimmed.slice(prefix.length);
        }
    }
    return '';
}

/** True when the CloudFront Function has set an ava_session cookie on
 * this browser. The UI treats this as "the user is federated in from
 * AVA — skip the local Cognito login screen".
 */
export function hasAvaSession(): boolean {
    return readCookie('ava_session').length > 0;
}

/** Returns fetch-compatible headers containing an Authorization: Bearer
 * with the ava_session cookie value, or an empty object when the cookie
 * is absent. Callers spread this into their existing headers block; it's
 * additive and never overrides existing keys.
 */
export function avaAuthHeaders(): Record<string, string> {
    const token = readCookie('ava_session');
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
}
