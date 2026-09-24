# KYC Controlled Quality Output — Deploy Runbook & RACI

Authoritative reference for who deploys what and how. Supersedes any `*.bat` references
(there is **no** `push-test-kyc.bat` — the entry points are the `.sh` scripts below).

## Deploy scripts (all in `applications/reference_implementations/kyc-governance-insights/ui/`)

| Script | Target | Bucket | Distribution | URL | Sync mode |
|---|---|---|---|---|---|
| `deploy.sh` | **TEST** | `kyc-governance-demo-test-uibucket-vpklywuml5hp` | `E1V1IBH8DIKFGR` | https://d3r8o92vlqvocy.cloudfront.net | `--delete` (single-app bucket); excludes `runtime-config.json` |
| `deploy-prod.sh` | **PROD** | `kyc-governance-demo-uibucket-gzvmftyoiqv8` | `E1Q6VO2AHA03JB` | https://d34f241zukf5gh.cloudfront.net (basic-auth login shared out-of-band — not committed) | **ADDITIVE, NO `--delete`** (multi-console bucket); pushes `runtime-config.json` separately |
| `push-and-deploy.sh "msg"` | **TEST** + git | (TEST bucket, as above) | — | — | build → git commit → push (via PowerShell) → TEST sync + invalidate |

Each script rebuilds (`vite build`) before syncing, then creates a CloudFront `/*` invalidation.

**Why PROD is additive:** the PROD bucket hosts sibling consoles at `/claims/`, `/mortgage/`,
`/trade/`, `/kyc/`. `deploy-prod.sh` syncs to root only with **no `--delete`** so siblings are
never touched. Do not add `--delete` to the PROD script.

## Backend / data (in `use_cases/kyc_governance_insights/deploy/console-services/`)

| Script | Purpose |
|---|---|
| `deploy_all.sh --region us-east-1` | Deploy the console-service CFN stacks (proxies, gateway, tables) |
| `seed_evaluations.py --region us-east-1` | Seed evaluator definitions |
| `seed_phase3.py --region us-east-1` | Seed pinned evaluations + 30-day metrics history |

Note: the consolidated gateway (`46md2r9izf`) is CLI-managed, not a CFN stack — gateway route
changes are applied via `aws apigatewayv2` CLI, not by redeploying the template.

## How to run (WSL)

```bash
cd ~/ava-official/applications/reference_implementations/kyc-governance-insights/ui
bash deploy.sh            # TEST   (use `bash`, not `./` — perms)
bash deploy-prod.sh       # PROD   (only after approval — see RACI)
```

Prereq: valid AWS creds for account **548509140218** (they expire every few minutes — the
human pastes a fresh Isengard export + runs `awssave` before a deploy burst).

## RACI — who does what

| Step | Owner | Notes |
|---|---|---|
| **Build + deploy TEST** | **Kiro** | Runs on request. Reports S3 sync result + CloudFront invalidation ID. |
| **Verify the deployed result** | **Quick** | Browser-checks each persona (landing tab, collapsed sections, tabs), confirms Basic Mode narrative/numbers unchanged. Files gaps as `BUILD_TASK_*.md`. Does not run deploys. |
| **Approve PROD** | **Human (Roshan)** | Explicit go required before any PROD deploy. The human gate. |
| **Deploy PROD** | **Kiro** | Only after (a) TEST verified and (b) explicit human approval. Runs `deploy-prod.sh` (additive). Confirms it's the no-`--delete` script before running. |
| **Provide AWS creds** | **Human (Roshan)** | Creds expire fast; Kiro cannot refresh them. |

### The rule, stated plainly
- **Kiro deploys** (TEST freely on request; PROD only on explicit human approval) and reports exact output.
- **Quick verifies** the live result and reports gaps — it does not deploy and does not need to hand Kiro commands; "deploy TEST" / "deploy PROD (approved)" is enough.
- **Roshan approves PROD** and supplies AWS creds.

### Standing guardrails Kiro follows
- TEST before PROD, always. PROD only after Basic Mode is verified untouched.
- PROD is a live, stakeholder-facing environment → Kiro will not deploy PROD without an explicit human "approved", and will re-confirm the script is additive first.
- Kiro never edits `kyc_banking/` (wrong app) and never touches the sibling PROD console prefixes.
