# KYC Controlled Quality Output — Deploy Targets (authoritative)

> Written to end the "which URL is prod?" confusion. All resources below are in AWS
> account **548509140218**, region **us-east-1**, unless stated otherwise.
> Basic-auth credentials for the prod demo are shared with the team out-of-band (not in git).

## The team-facing PROD URL (official shareable demo)

**https://d34f241zukf5gh.cloudfront.net**  (basic auth: `fsigovdemo` / `FsiDemo2026`)

- CloudFront distribution: **E1Q6VO2AHA03JB**
- Origin bucket: **kyc-governance-demo-uibucket-gzvmftyoiqv8**
- The KYC Governance Console is served at the site **root `/`**.
- Deploy with: `./deploy-prod.sh` (build → additive S3 sync to root → upload runtime-config → invalidate).
- **This is the official URL to share with the team / customers.** It runs the latest build and
  is access-gated (see below).

### Access gate (Basic Auth)
Enforced by a **CloudFront Function** on the default cache behavior, not by the app.
- The gate lives in the function **`kyc-governance-demo-spa-router`** (viewer-request): it does an
  HTTP Basic-Auth check (401 if missing/wrong) *then* the multi-app SPA routing. The two are
  combined because CloudFront allows only one viewer-request function per behavior.
- Credentials `fsigovdemo` / `FsiDemo2026` (base64 `ZnNpZ292ZGVtbzpGc2lEZW1vMjAyNg==`).
- Full source + revert steps: `docs/CLOUDFRONT_AUTH_GATE.md`.
- **TEST (`d3r8o92vlqvocy`) is intentionally left OPEN** (no gate) for fast iteration.
- History: the gate was silently dropped at some point (site was fully open); restored 2026-07.

> NOTE: two weeks ago this URL was announced to the team mislabelled as "KYC Banking".
> It is NOT kyc_banking — the origin bucket is `kyc-governance-demo-uibucket`. It has always
> been the KYC **Governance** demo. `kyc_banking` (Vivian et al., use case B01) is a separate
> app we do not touch.

## IMPORTANT: the prod bucket hosts MULTIPLE consoles

`kyc-governance-demo-uibucket-gzvmftyoiqv8` serves four self-contained SPAs at sibling prefixes:

| Path | Console |
|------|---------|
| `/` | KYC Governance (the team URL) |
| `/kyc/` | mirror of the KYC console |
| `/claims/` | Claims Processing |
| `/mortgage/` | Mortgage Processing |
| `/trade/` | Trade Surveillance |

**Never run an `s3 sync ... --delete` against this bucket root** — it would delete the
Claims / Mortgage / Trade consoles. `deploy-prod.sh` uses an additive sync (no `--delete`).

## All KYC Governance distributions (this account)

| URL | Dist ID | Origin bucket | Account | Access | Purpose |
|-----|---------|---------------|---------|--------|---------|
| d34f241zukf5gh.cloudfront.net | E1Q6VO2AHA03JB | kyc-governance-demo-uibucket-gzvmftyoiqv8 | 548509140218 (ours) | Basic auth | **PROD — official shareable** (root; `deploy-prod.sh`) |
| d3r8o92vlqvocy.cloudfront.net | E1V1IBH8DIKFGR | kyc-governance-demo-test-uibucket-vpklywuml5hp | 548509140218 (ours) | Open | TEST (root; `deploy.sh`) |
| d2taidiy6o88hk.cloudfront.net | E3DAPJBDPSYB78 | ava-kyc-governance-insights-lg-ui-useast1-446224796353 | 446224796353 (Raphael/AVA) | Open | AVA-app deploy target — see freshness note |

### Which is authoritative + build freshness (verified 2026-07 by fetching each site's runtime-config.json)
- All three serve the **same app** (`kyc_governance_insights`, B11) — none is `kyc_banking`.
- **d34f241zukf5gh (ours) and d3r8o92vlqvocy (ours) run the LATEST build** — Cedar `xgkacmjesb`,
  HITL `tovdy9yzy9`, Grounding `mindupjlp8` (all live/fixed).
- **d2taidiy6o88hk (Raphael's AVA account) is STALE** — it still points at the dead orphan
  endpoints (Cedar `hf87s4kwmk`, HITL `j64az3x7g7`, Grounding `w8749wujod`), so its
  Verified-by-Cedar / Review Queue / Grounding features are currently broken. **Do not share
  d2taidiy6o88hk until Raphael redeploys from the current branch.**

Other demos in the same account (do not deploy KYC here): trade-surveillance (d20ib6srimqhbo),
claims-processing (dfaqfyqylqr3e), mortgage-processing (dt2q2jg2vl3cc), AVA control-plane dev
(d3oezvfyfhvrf9).

## Backend (shared) — used by both TEST and PROD

- Cedar policy store (AVP): **L3yUSPSB7oD9EoarS8ZS9m** (stack `kyc-cedar-gateway`), 19 policies.
- Cedar proxy API (live is-authorized for Basic mode): **https://xyz.execute-api.us-east-1.amazonaws.com**
  (stack `kyc-cedar-proxy`). `runtime-config.json` `cedar_api_url` must point here.
  - The old proxy `hf87s4kwmk` is an orphan — do not use.
- Other console-services (metrics/registry/hitl/grounding) are per `runtime-config.json`.

## Alternative deploy (AVA FSI Foundry) — Raphael's account

Raphael deploys the same `kyc_governance_insights` app to **account 446224796353** via the AVA FSI
Foundry pipeline → **https://d2taidiy6o88hk.cloudfront.net** (dist `E3DAPJBDPSYB78`, bucket
`ava-kyc-governance-insights-lg-ui-useast1-446224796353`). This path is independent of the manual
`deploy-prod.sh` above and does NOT auto-update when we deploy — it only reflects the code Raphael
last pushed through the AVA pipeline. As of the 2026-07 verification it was running a **stale build
with broken (orphan) backends** — treat it as behind until Raphael redeploys.

## Deploy scripts (local, not committed)

`deploy.sh` (TEST), `deploy-prod.sh` (PROD), `push-and-deploy.sh` live in this folder on the
maintainer's machine. Only this doc is committed. To reproduce, ask the maintainer or recreate
from the resource IDs above.
