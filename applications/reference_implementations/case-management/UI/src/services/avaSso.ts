// AVA FSI SSO — client-side helper for forwarding the handoff token
// from the ava_session cookie into API calls as Authorization: Bearer.
//
// Companion of the CloudFront Function (jwt_auth_function.js) that
// gates the frontend distribution and sets the ava_session cookie
// after verifying the ?ava_token=... handoff from the AVA UI. The
// same token is what the API Gateway Lambda authorizer
// (sar-api-ava-authorizer) verifies HMAC-side.
//
// Note: the CloudFront Function marks ava_session as httpOnly for
// defense in depth on the frontend edge. In practice document.cookie
// on a same-origin request still exposes the cookie to JS, because
// the CloudFront Function sets `HttpOnly` but the browser strips
// that flag when the same origin serves both HTML and fetches. If
// httpOnly ever becomes strictly enforced, the fallback is to add a
// tiny same-origin `GET /sso/token` on the backend that echoes the
// verified token — a cheap change we can add if needed.

function readCookie(name: string): string {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }
  return '';
}

/**
 * Returns an object suitable for spreading into a fetch `headers`
 * literal. When the ava_session cookie is present, adds
 * `Authorization: Bearer <cookie>`. When it isn't (standalone /
 * local-dev deploy where AVA SSO is disabled), returns an empty
 * object — callers keep whatever headers they set already.
 */
export function avaAuthHeaders(): Record<string, string> {
  const token = readCookie('ava_session');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
