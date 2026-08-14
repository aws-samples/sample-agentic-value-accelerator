// AVA FSI SSO edge auth — HMAC-SHA256 verification.
// Companion of platform/control_plane/backend/src/api/routes/fsi_sso.py.
// AVA backend RS256-verifies the caller's Cognito id_token, then mints a
// short-lived HMAC-signed handoff token. This CloudFront Function verifies
// the HMAC at the edge before any request reaches S3.
//
// Uses ONLY APIs documented as supported in CloudFront Functions 2.0:
// crypto.createHmac + string operations. NOT crypto.createVerify (absent),
// NOT crypto.subtle (absent).
//
// Template placeholders substituted at deploy time by attach_cf_auth.py:
//   __SIGNING_SECRET__, __LOGIN_URL__

import crypto from 'crypto';

var SIGNING_SECRET = "__SIGNING_SECRET__";
var LOGIN_URL = "__LOGIN_URL__";

function unauthorized(reason) {
    return {
        statusCode: 302,
        statusDescription: 'Found',
        headers: {
            'location': { value: LOGIN_URL || '/' },
            'x-ava-auth-fail': { value: reason },
        }
    };
}

function constantTimeEquals(a, b) {
    if (a.length !== b.length) return false;
    var xor = 0;
    for (var i = 0; i < a.length; i++) {
        xor |= (a.charCodeAt(i) ^ b.charCodeAt(i));
    }
    return xor === 0;
}

function verifyToken(token) {
    var parts = token.split('.');
    if (parts.length !== 3) throw new Error('malformed');

    var signingInput = parts[0] + '.' + parts[1];
    var expectedSig = crypto
        .createHmac('sha256', SIGNING_SECRET)
        .update(signingInput)
        .digest('base64url');
    if (!constantTimeEquals(expectedSig, parts[2])) {
        throw new Error('bad_sig');
    }

    var payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    var now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) throw new Error('expired');
}

function readCookies(request) {
    var out = {};
    var c = request.cookies || {};
    for (var k in c) out[k] = c[k].value;
    return out;
}

function handler(event) {
    var request = event.request;
    var uri = request.uri;
    var qs = request.querystring || {};

    // ---- 1. Bootstrap via ?ava_token= (first click from AVA UI) ----
    if (qs.ava_token && qs.ava_token.value) {
        try {
            verifyToken(qs.ava_token.value);
        } catch (e) {
            return unauthorized('bootstrap_' + e.message);
        }
        var keep = [];
        for (var k in qs) {
            if (k === 'ava_token') continue;
            keep.push(k + '=' + qs[k].value);
        }
        var cleanUrl = uri + (keep.length ? '?' + keep.join('&') : '');
        return {
            statusCode: 302,
            statusDescription: 'Found',
            headers: {
                'location': { value: cleanUrl },
            },
            // CloudFront Functions require Set-Cookie in response.cookies,
            // NOT response.headers — else FunctionValidationError → 503.
            cookies: {
                'ava_session': {
                    value: qs.ava_token.value,
                    attributes: 'Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600',
                },
            },
        };
    }

    // ---- 2. Normal request — cookie must be present and valid ----
    var cookies = readCookies(request);
    if (!cookies.ava_session) return unauthorized('no_cookie');
    try {
        verifyToken(cookies.ava_session);
    } catch (e) {
        return unauthorized(e.message);
    }

    // ---- 3. SPA rewrite (non-file paths → index.html) ----
    if (!uri.includes('.')) {
        request.uri = '/index.html';
    }
    return request;
}
