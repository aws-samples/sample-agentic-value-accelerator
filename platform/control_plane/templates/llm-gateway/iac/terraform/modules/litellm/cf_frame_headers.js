// AVA LLM Gateway — CloudFront Function (viewer-response).
//
// LiteLLM emits `X-Frame-Options: DENY` and `Content-Security-Policy:
// frame-ancestors 'none'` on every response, which blocks embedding the
// admin UI in the AVA console iframe. Strip those two headers here so the
// browser allows framing. Clickjacking risk is mitigated by the AVA SSO
// gate on viewer-request — an attacker's page can't get a valid ava_token,
// so the framed content shows the login redirect, not the admin UI.

function handler(event) {
    var response = event.response;
    var headers = response.headers;

    delete headers['x-frame-options'];

    if (headers['content-security-policy']) {
        var csp = headers['content-security-policy'].value || '';
        csp = csp.replace(/frame-ancestors[^;]*;?\s*/i, '');
        if (csp.trim()) {
            headers['content-security-policy'] = { value: csp.trim() };
        } else {
            delete headers['content-security-policy'];
        }
    }

    return response;
}
