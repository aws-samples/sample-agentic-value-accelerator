'use strict';

const https = require('https');
const querystring = require('querystring');

const LANGFUSE_EMAIL = '${langfuse_email}';
const LANGFUSE_PASSWORD = '${langfuse_password}';

let cachedCookies = null;
let cachedExpiry = 0;

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

async function getSessionCookies(host) {
  const now = Date.now();
  if (cachedCookies && cachedExpiry > now) {
    return cachedCookies;
  }

  const csrfRes = await httpRequest({
    hostname: host,
    path: '/api/auth/csrf',
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  const csrfData = JSON.parse(csrfRes.body);
  const csrfCookies = extractCookies(csrfRes.headers);

  const postData = querystring.stringify({
    email: LANGFUSE_EMAIL,
    password: LANGFUSE_PASSWORD,
    csrfToken: csrfData.csrfToken,
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

  cachedCookies = allCookies;
  cachedExpiry = now + 10 * 60 * 1000;

  return allCookies;
}

exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  const response = event.Records[0].cf.response;
  const headers = response.headers;

  // Strip X-Frame-Options
  delete headers['x-frame-options'];

  // Fix CSP frame-ancestors
  if (headers['content-security-policy']) {
    headers['content-security-policy'][0].value =
      headers['content-security-policy'][0].value.replace(/frame-ancestors[^;]*;?/, 'frame-ancestors *;');
  }

  // Rewrite all existing Set-Cookie headers to SameSite=None for iframe compatibility
  if (headers['set-cookie']) {
    headers['set-cookie'] = headers['set-cookie'].map(function(c) {
      var val = c.value;
      val = val.replace(/SameSite=Lax/gi, 'SameSite=None');
      val = val.replace(/SameSite=Strict/gi, 'SameSite=None');
      if (!/SameSite/i.test(val)) {
        val = val.replace(/;(\s*)$/, '; SameSite=None;');
        if (!/SameSite/i.test(val)) {
          val += '; SameSite=None';
        }
      }
      return { key: 'Set-Cookie', value: val };
    });
  }

  // Skip cookie injection for auth endpoints used by the Lambda to avoid loops
  if (request.uri === '/api/auth/csrf' || request.uri.startsWith('/api/auth/callback/')) {
    return response;
  }

  // Inject Set-Cookie headers so the browser has the session for client-side JS
  try {
    var host = request.headers.host ? request.headers.host[0].value : null;
    if (host) {
      var cookies = await getSessionCookies(host);
      var sessionCookies = cookies.filter(function(c) { return c.includes('next-auth'); });

      if (sessionCookies.length > 0) {
        if (!headers['set-cookie']) {
          headers['set-cookie'] = [];
        }
        for (var i = 0; i < sessionCookies.length; i++) {
          var val = sessionCookies[i].replace(/SameSite=Lax/gi, 'SameSite=None');
          headers['set-cookie'].push({ key: 'Set-Cookie', value: val });
        }
      }
    }
  } catch (err) {
    console.error('Failed to inject session cookies:', err);
  }

  return response;
};
