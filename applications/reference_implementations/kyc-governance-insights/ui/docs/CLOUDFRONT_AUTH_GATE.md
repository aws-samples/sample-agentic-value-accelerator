# PROD access gate — CloudFront Function (Basic Auth)

The team-facing PROD demo **https://d34f241zukf5gh.cloudfront.net** (dist `E1Q6VO2AHA03JB`,
account `548509140218`, us-east-1) is gated by a light HTTP Basic-Auth check enforced at the
edge by a **CloudFront Function**, not by the app.

- Credentials: `fsigovdemo` / `FsiDemo2026`  (base64 `ZnNpZ292ZGVtbzpGc2lEZW1vMjAyNg==`)
- TEST (`d3r8o92vlqvocy`, dist `E1V1IBH8DIKFGR`) is intentionally **left open** (uses a separate
  function `kyc-governance-demo-test-spa-router` with routing only, no auth).

## Why the auth is inside the SPA-router function
CloudFront allows only **one** `viewer-request` function per cache behavior. The PROD default
behavior already ran `kyc-governance-demo-spa-router` for multi-app SPA routing, so the auth check
is **folded in front of** the routing logic in that same function. (A standalone
`fsi-demo-basic-auth` function also exists in the account but is NOT associated — it's the original
gate that was dropped; kept for reference.)

Because `kyc-governance-demo-spa-router` is already associated with the PROD default behavior,
publishing a new version to LIVE takes effect automatically — no distribution/association change.

## Current function source (`kyc-governance-demo-spa-router`, viewer-request, cloudfront-js-2.0)

```js
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
  if (uri.match(/\.\w+$/)) { return request; }         // static asset → pass through
  var apps = ['/kyc/', '/trade/', '/claims/', '/mortgage/'];
  for (var i = 0; i < apps.length; i++) {
    if (uri.startsWith(apps[i]) || uri === apps[i].slice(0, -1)) {
      request.uri = apps[i] + 'index.html';
      return request;
    }
  }
  request.uri = '/index.html';                         // root / unmatched → root SPA
  return request;
}
```

## Apply / update (CLI — CFN not used for this)

```bash
export AWS_PAGER=""
FN=kyc-governance-demo-spa-router
# 1. save the source above to combined.js (LF line endings)
ETAG=$(aws cloudfront describe-function --name "$FN" --stage DEVELOPMENT --query ETag --output text)
NEW=$(aws cloudfront update-function --name "$FN" --if-match "$ETAG" \
        --function-code fileb://combined.js \
        --function-config Comment="SPA router + basic-auth gate (prod)",Runtime=cloudfront-js-2.0 \
        --query ETag --output text)
aws cloudfront publish-function --name "$FN" --if-match "$NEW"
```

## Verify

```bash
P=https://d34f241zukf5gh.cloudfront.net
curl -s -o /dev/null -w '%{http_code}\n' "$P/"                       # expect 401
curl -s -o /dev/null -w '%{http_code}\n' -u fsigovdemo:FsiDemo2026 "$P/"  # expect 200
curl -s -o /dev/null -w '%{http_code}\n' https://d3r8o92vlqvocy.cloudfront.net/  # TEST: expect 200 (open)
```

## Revert (remove the gate, keep routing)

Re-publish `kyc-governance-demo-spa-router` with the routing-only body (drop the Basic-Auth block
at the top), using the same update → publish steps. No distribution change needed.

## Change the password
Replace the base64 in `expected` with `base64(user:pass)`:
```bash
printf '%s' 'newuser:newpass' | base64
```
Then update + publish. Also update `docs/DEPLOY_TARGETS.md` and `.kiro/rules.md` Rule 7.

> Note: this gate lives in AWS, not in the app build. Redeploying the UI (`deploy-prod.sh`) does
> NOT touch it. Only `update-function`/`publish-function` on `kyc-governance-demo-spa-router` change it.
