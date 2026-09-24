// CloudFront Function (runtime cloudfront-js-2.0, event: viewer-request)
// Name: kyc-governance-demo-spa-router  (PROD dist E1Q6VO2AHA03JB / d34f241zukf5gh)
//
// This is the DEPLOYED source of truth for the prod viewer-request function.
// CloudFront allows only ONE viewer-request function per cache behavior, so the
// light Basic-Auth gate is folded in FRONT of the multi-app SPA routing.
//
// Deployed via CLI (CFN for the multi-console dist is managed elsewhere):
//   aws cloudfront update-function --name kyc-governance-demo-spa-router \
//     --if-match <ETag> --function-code fileb://this.js \
//     --function-config Comment="SPA router + basic-auth gate (prod)",Runtime=cloudfront-js-2.0
//   aws cloudfront publish-function --name kyc-governance-demo-spa-router --if-match <newETag>
//
// Credentials: fsigovdemo / FsiDemo2026  (base64 of "fsigovdemo:FsiDemo2026").
// TEST dist (d3r8o92vlqvocy) intentionally has NO gate — uses a separate function
// kyc-governance-demo-test-spa-router (routing only).

function handler(event) {
  var request = event.request;
  var headers = request.headers;

  // --- Light gate: HTTP Basic Auth ---
  var expected = "Basic ZnNpZ292ZGVtbzpGc2lEZW1vMjAyNg==";
  if (!headers.authorization || headers.authorization.value !== expected) {
    return {
      statusCode: 401,
      statusDescription: "Unauthorized",
      headers: {
        "www-authenticate": { value: 'Basic realm="KYC Governance Demo"' }
      }
    };
  }

  // --- Multi-app SPA path routing ---
  var uri = request.uri;
  if (uri.match(/\.\w+$/)) {
    return request; // static asset, pass through
  }
  var apps = ['/kyc/', '/trade/', '/claims/', '/mortgage/'];
  for (var i = 0; i < apps.length; i++) {
    if (uri.startsWith(apps[i]) || uri === apps[i].slice(0, -1)) {
      request.uri = apps[i] + 'index.html';
      return request;
    }
  }
  request.uri = '/index.html';
  return request;
}
