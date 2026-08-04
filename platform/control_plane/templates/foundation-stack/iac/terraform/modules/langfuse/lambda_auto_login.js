'use strict';

const https = require('https');
const querystring = require('querystring');
const crypto = require('crypto');

// Injected at deploy time via Terraform templatefile
const LANGFUSE_EMAIL = '${langfuse_email}';
const LANGFUSE_PASSWORD = '${langfuse_password}';

// AVA FSI SSO — shared HMAC secret (from CP terraform's random_password.fsi_app_signing_secret)
// and AVA UI URL to redirect unauth'd browsers to. Empty signing_secret disables the SSO gate.
const AVA_SIGNING_SECRET = '${signing_secret}';
const AVA_LOGIN_URL = '${login_url}';

// Cookie name used by NextAuth
const SESSION_COOKIE = '__Secure-next-auth.session-token';

// Cache the session to avoid authenticating on every request
let cachedSession = null;
let cachedSessionExpiry = 0;

function hasSessionCookie(headers) {
  if (!headers.cookie) return false;
  for (const cookieHeader of headers.cookie) {
    if (cookieHeader.value.includes(SESSION_COOKIE)) {
      return true;
    }
  }
  return false;
}

function getHost(headers) {
  if (headers.host && headers.host[0]) {
    return headers.host[0].value;
  }
  return null;
}

function httpRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function extractCookies(headers) {
  const cookies = [];
  const setCookie = headers['set-cookie'];
  if (setCookie) {
    for (const c of (Array.isArray(setCookie) ? setCookie : [setCookie])) {
      cookies.push(c);
    }
  }
  return cookies;
}

function cookieString(cookies) {
  return cookies.map(c => c.split(';')[0]).join('; ');
}

// Build the same X-Ava-S2s header our server-to-server callers use. When this
// Lambda calls Langfuse's own auth endpoints from itself the requests hit the
// AVA SSO gate again — without this header the gate 302s the calls to the AVA
// login page and auto-login silently fails. Signing with AVA_SIGNING_SECRET
// proves this Lambda holds the shared secret; matches verifyS2sHeader().
function s2sHeader(path) {
  if (!AVA_SIGNING_SECRET) return {};
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto
    .createHmac('sha256', AVA_SIGNING_SECRET)
    .update(ts + ':' + path)
    .digest('hex');
  return { 'X-Ava-S2s': ts + '.' + sig };
}

async function authenticate(host) {
  // Return cached session if still valid (cache for 10 minutes)
  const now = Date.now();
  if (cachedSession && cachedSessionExpiry > now) {
    return cachedSession;
  }

  // Step 1: Get CSRF token
  const csrfPath = '/api/auth/csrf';
  const csrfRes = await httpRequest({
    hostname: host,
    path: csrfPath,
    method: 'GET',
    headers: { 'Accept': 'application/json', ...s2sHeader(csrfPath) }
  });

  const csrfData = JSON.parse(csrfRes.body);
  const csrfToken = csrfData.csrfToken;
  const csrfCookies = extractCookies(csrfRes.headers);

  // Step 2: Sign in
  const postData = querystring.stringify({
    email: LANGFUSE_EMAIL,
    password: LANGFUSE_PASSWORD,
    csrfToken: csrfToken,
    callbackUrl: 'https://' + host,
    json: 'true'
  });

  const signInPath = '/api/auth/callback/credentials';
  const signInRes = await httpRequest({
    hostname: host,
    path: signInPath,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
      'Cookie': cookieString(csrfCookies),
      ...s2sHeader(signInPath),
    }
  }, postData);

  const allCookies = [...csrfCookies, ...extractCookies(signInRes.headers)];
  const sessionCookie = cookieString(allCookies);

  // Cache for 10 minutes
  cachedSession = sessionCookie;
  cachedSessionExpiry = now + 10 * 60 * 1000;

  return sessionCookie;
}

// ============================================================================
// AVA FSI SSO gate — HMAC verification of handoff tokens from AVA backend
// ============================================================================
// The AVA backend RS256-verifies the caller's Cognito id_token, then mints
// a short-lived HMAC-signed handoff token (POST /api/v1/fsi/sign-app-token).
// This gate verifies the same HMAC before allowing browser traffic through.
// Agent OTEL traffic to /api/public/* is bypassed — Langfuse's own API-key
// auth guards that surface.

// Node's `Buffer.equal`-style timing-safe comparison of the sig strings.
function constantTimeEquals(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function avaUnauthorized(reason) {
  return {
    status: '302',
    statusDescription: 'Found',
    headers: {
      'location': [{ key: 'Location', value: AVA_LOGIN_URL || '/' }],
      'x-ava-auth-fail': [{ key: 'X-Ava-Auth-Fail', value: reason }],
    },
  };
}

// Verify an HMAC-signed handoff token. Throws on failure.
function avaVerifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const signingInput = parts[0] + '.' + parts[1];
  const expected = crypto.createHmac('sha256', AVA_SIGNING_SECRET)
    .update(signingInput).digest('base64url');
  if (!constantTimeEquals(expected, parts[2])) throw new Error('bad_sig');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) throw new Error('expired');
}

// Read cookie value by name from CloudFront viewer-request headers.
function getCookieValue(headers, name) {
  if (!headers.cookie) return null;
  for (const c of headers.cookie) {
    const parts = c.value.split(';');
    for (const p of parts) {
      const eq = p.indexOf('=');
      if (eq === -1) continue;
      if (p.substring(0, eq).trim() === name) {
        return p.substring(eq + 1).trim();
      }
    }
  }
  return null;
}

// Extract ?ava_token=... from the request querystring.
function getAvaTokenParam(request) {
  const qs = request.querystring || '';
  for (const kv of qs.split('&')) {
    const eq = kv.indexOf('=');
    if (eq === -1) continue;
    if (kv.substring(0, eq) === 'ava_token') {
      return decodeURIComponent(kv.substring(eq + 1));
    }
  }
  return null;
}

// Strip ava_token from a querystring, preserving other params.
function stripAvaToken(qs) {
  return (qs || '').split('&').filter(function (kv) {
    return kv && !kv.startsWith('ava_token=');
  }).join('&');
}

// Path prefixes that must bypass the SSO gate — agent OTEL + health probes.
// Langfuse enforces API-key auth on these on its own; adding a browser gate
// here would break every FSI Foundry agent's tracing.
function isAvaBypassPath(uri) {
  return uri.startsWith('/api/public/') ||
         uri.startsWith('/api/ingestion') ||
         uri === '/api/health';
}

// Server-to-server bypass. The AVA control plane's LangfuseProvisioningService
// (backend/src/services/langfuse_provisioning.py) needs to hit /api/auth/* and
// /api/trpc/* to create per-app projects and mint per-app API keys at deploy
// time. Those paths are otherwise gated (they aren't the public OTEL ingest
// surface). We accept them ONLY when the caller proves possession of the
// shared HMAC secret via a signed X-Ava-S2s header of the form:
//
//   X-Ava-S2s: <unix_timestamp>.<hex(hmac-sha256(secret, timestamp + ':' + uri))>
//
// The timestamp bounds replay to a 5-minute window. Anyone without the secret
// (i.e. anyone on the internet) cannot forge a valid header. Only backend code
// running in-account with the fsi_app_signing_secret env var can.
function verifyS2sHeader(request) {
  const h = request.headers['x-ava-s2s'];
  if (!h || !h[0] || !h[0].value) return false;
  const parts = h[0].value.split('.');
  if (parts.length !== 2) return false;
  const ts = parseInt(parts[0], 10);
  if (!ts || isNaN(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;    // 5-minute replay window
  const expected = crypto
    .createHmac('sha256', AVA_SIGNING_SECRET)
    .update(parts[0] + ':' + request.uri)
    .digest('hex');
  return constantTimeEquals(expected, parts[1]);
}

// AVA SSO gate — returns null if the request should continue, or a response object to short-circuit.
// When AVA_SIGNING_SECRET is empty, the gate is disabled entirely (opt-in).
function avaSsoGate(request) {
  if (!AVA_SIGNING_SECRET) return null;                    // gate disabled
  if (isAvaBypassPath(request.uri)) return null;            // agent traffic
  if (verifyS2sHeader(request)) return null;                // AVA backend provisioning

  // 1. Bootstrap: ?ava_token=<blob> — verify, set cookie, 302 to strip.
  const paramToken = getAvaTokenParam(request);
  if (paramToken) {
    try { avaVerifyToken(paramToken); }
    catch (e) { return avaUnauthorized('bootstrap_' + e.message); }
    const cleanQs = stripAvaToken(request.querystring);
    const cleanUri = request.uri + (cleanQs ? '?' + cleanQs : '');
    // Cookie must be SameSite=None to survive iframe embedding in AVA UI.
    return {
      status: '302',
      statusDescription: 'Found',
      headers: {
        'location': [{ key: 'Location', value: cleanUri }],
        'set-cookie': [{
          key: 'Set-Cookie',
          value: 'ava_session=' + paramToken + '; Path=/; Secure; HttpOnly; SameSite=None; Max-Age=3600',
        }],
      },
    };
  }

  // 2. Normal: ava_session cookie must be present and valid.
  const cookieToken = getCookieValue(request.headers, 'ava_session');
  if (!cookieToken) return avaUnauthorized('no_ava_session');
  try { avaVerifyToken(cookieToken); }
  catch (e) { return avaUnauthorized(e.message); }
  return null;  // AVA-authenticated, fall through to auto-login
}

exports.handler = async (event) => {
  const request = event.Records[0].cf.request;

  // ────────────────────────────────────────────────────────────────────
  // AVA SSO gate FIRST — before anything else, including auto-login.
  // ────────────────────────────────────────────────────────────────────
  const gateResponse = avaSsoGate(request);
  if (gateResponse) return gateResponse;

  // If user already has a session cookie, pass through
  if (hasSessionCookie(request.headers)) {
    return request;
  }

  // Skip only the specific auth endpoints the Lambda calls to avoid loops
  if (request.uri === '/api/auth/csrf' || request.uri.startsWith('/api/auth/callback/')) {
    return request;
  }

  const host = getHost(request.headers);
  if (!host) {
    return request;
  }

  try {
    const sessionCookie = await authenticate(host);

    // Inject the session cookie into the request headers
    // This makes the origin think the user is already authenticated
    if (request.headers.cookie) {
      request.headers.cookie[0].value += '; ' + sessionCookie;
    } else {
      request.headers.cookie = [{ key: 'Cookie', value: sessionCookie }];
    }

    return request;
  } catch (err) {
    console.error('Auto-login failed:', err);
    return request;
  }
};
