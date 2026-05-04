'use strict';

const https = require('https');
const querystring = require('querystring');

// Injected at deploy time via Terraform templatefile
const LANGFUSE_EMAIL = '${langfuse_email}';
const LANGFUSE_PASSWORD = '${langfuse_password}';

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

async function authenticate(host) {
  // Return cached session if still valid (cache for 10 minutes)
  const now = Date.now();
  if (cachedSession && cachedSessionExpiry > now) {
    return cachedSession;
  }

  // Step 1: Get CSRF token
  const csrfRes = await httpRequest({
    hostname: host,
    path: '/api/auth/csrf',
    method: 'GET',
    headers: { 'Accept': 'application/json' }
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

  const signInRes = await httpRequest({
    hostname: host,
    path: '/api/auth/callback/credentials',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
      'Cookie': cookieString(csrfCookies)
    }
  }, postData);

  const allCookies = [...csrfCookies, ...extractCookies(signInRes.headers)];
  const sessionCookie = cookieString(allCookies);

  // Cache for 10 minutes
  cachedSession = sessionCookie;
  cachedSessionExpiry = now + 10 * 60 * 1000;

  return sessionCookie;
}

exports.handler = async (event) => {
  const request = event.Records[0].cf.request;

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
