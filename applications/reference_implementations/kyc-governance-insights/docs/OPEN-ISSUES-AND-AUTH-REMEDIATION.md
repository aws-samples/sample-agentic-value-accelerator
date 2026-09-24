# KYC Controlled Quality Output — open issues and authentication remediation

Status of this document: written after porting the use case out of FSI Foundry into
`applications/reference_implementations/kyc-governance-insights`, making it deployable from the
AVA Control Plane, and then tearing the deployment down. It records what is still open, and in
particular what must happen before this console is exposed again.

Resource identifiers are deliberately given as **logical names only** (stack, function, variable,
parameter). API ids, distribution ids, bucket names and account numbers differ per account and must
be resolved at run time.

---

## 1. Authentication — the console had none (highest priority)

### 1.1 What was observed

With the use case deployed, every route answered anonymous requests from the internet:

| Path | Response without credentials |
|---|---|
| `/` | 200 |
| `/runtime-config.json` | 200 |
| `/svc/health` | 200 |
| `/svc/cedar/ar-check` | 200 |

No `401`, no `WWW-Authenticate`, no redirect to a login. The governance APIs — Cedar policy
evaluation, the registry, HITL, metrics, the deterministic validator — were reachable by anyone
holding the CloudFront URL.

### 1.2 Root cause

Two independent gaps combine. Fixing only the first still leaves the APIs open.

**Gap A — the edge auth function is never instantiated.**

The `ui` Terraform module *does* implement the AVA-standard SSO function
(`aws_cloudfront_function.jwt_auth`, template `ui/cloudfront/jwt_auth.js.tftpl`). It is gated on:

```hcl
locals {
  auth_enabled = var.fsi_app_signing_secret != ""
}

# default_cache_behavior
function_arn = local.auth_enabled ? aws_cloudfront_function.jwt_auth[0].arn
                                 : aws_cloudfront_function.spa_rewrite.arn
```

The deployed Control Plane predates `random_password.fsi_app_signing_secret`. Verified against the
deployed CP Terraform state: no `random_password` resource exists, the backend ECS task definition
carries no `*SIGNING*` or `*SECRET*` environment variable, and the deployment CodeBuild project has
only `ENVIRONMENT`, `LOCK_TABLE` and `AGENT_REGISTRY_ARN`. So `fsi_app_signing_secret` arrives empty,
`auth_enabled` is false, and CloudFront receives the ~167-byte SPA-rewrite function instead — which
contains no authorization logic at all.

**Consequence to note:** enabling `jwt_auth` on its own would lock everyone out rather than
authenticate them. The function verifies HMAC handoff tokens that only the AVA backend can mint, and
the backend cannot mint them until it holds the shared secret.

**Gap B — the `/svc/*` routing layer lives outside IaC, so it carries no auth.**

The `ui` module defines only two cache behaviours: the default (S3) and `/api/*`. The `svc-gateway`
origin and the `/svc/*` behaviour that front all governance APIs were added with
`aws cloudfront update-distribution` from scripts, not Terraform — see
`ui/docs/DESIGN_DECISION_API_CONSOLIDATION.md` ("Applied infrastructure (Phase 1 + 1.5) — as
deployed") and `deploy/console-services/origin-verify-authorizer/phase2-cf-inject-header.py`, whose
header comment describes the origin as "the origin added in Phase 1".

That has three effects:

1. `jwt_auth`, even when enabled, is associated only with behaviours the module knows about. `/svc/*`
   would remain unauthenticated.
2. The `kyc-svc-basic-auth` function association recorded in the design doc for "Phase 1.5" was no
   longer present at the time of testing, and no Terraform diff would ever have revealed that.
3. A `terraform apply` of the `ui` module reconciles the distribution to its configuration and would
   therefore **delete** the `/svc/*` behaviour and `svc-gateway` origin, breaking the console with no
   warning.

This violates architecture invariant MUST NOT #7 (no CLI-deployed infrastructure outside IaC), and
the security gap is a direct consequence of it.

### 1.3 What `x-origin-verify` does and does not do

`kyc-origin-verify-authorizer` is a REQUEST Lambda authorizer on the API Gateway routes; CloudFront
injects the shared secret as an origin custom header. It proves *a request arrived through our
CloudFront distribution*. It is not user authentication: CloudFront adds that header for anonymous
callers too. It defends against bypassing the edge, nothing more.

### 1.4 Remediation plan

Order matters. Steps 1 and 2 are both required before the console is exposed again.

**Step 1 — create and wire the shared signing secret (Control Plane).**

Apply `platform/control_plane/infrastructure`. The plan against the current deployment is
`9 to add, 11 to change, 1 to destroy`:

- adds `random_password.fsi_app_signing_secret`, an advanced-prompt-optimization bucket and its
  settings, an `organization_design` DynamoDB table, and two ECS task IAM policies;
- replaces `module.ecs.aws_ecs_task_definition.main` (routine; causes a backend rollout);
- updates the CP CloudFront distribution, the deployment CodeBuild project and buildspec object, the
  ECS service, several task IAM policies, and the Step Functions state machine.

The secret is consumed by both `module.ecs` (so the backend can mint handoff tokens) and
`module.codebuild` (so it is passed through to use-case UI deployments as
`AVA_FSI_APP_SIGNING_SECRET`). Applying only one side produces a mismatch where the edge verifies
tokens the backend cannot mint.

**Step 2 — bring `/svc/*` into the `ui` module and authenticate it.**

In `iac/terraform/ui/main.tf`:

- add the `svc-gateway` origin (domain = the console gateway HTTP API) with the `x-origin-verify`
  origin custom header sourced from Secrets Manager, replacing what
  `phase2-cf-inject-header.py` does imperatively;
- add an `ordered_cache_behavior` for `/svc/*` with caching disabled and all viewer headers except
  `Host` forwarded;
- associate `jwt_auth` on `viewer-request` for that behaviour as well, using the same
  `slice(["viewer-request"], 0, local.auth_enabled ? 1 : 0)` pattern already used for `/api/*`;
- forward cookies on `/svc/*` when `auth_enabled`, since the session lives in the `ava_session`
  cookie.

Retire the imperative CloudFront mutation from the console-services deploy once Terraform owns it, so
there is a single writer for the distribution.

**Step 3 — deploy and verify the control, not just the happy path.**

Deploy the use case, then confirm each of these:

| Check | Expected |
|---|---|
| `GET /` with no cookie | 302 to the AVA login URL, `x-ava-auth-fail: no_cookie` |
| `GET /svc/health` with no cookie | 302 / denied, **not** 200 |
| Launch with a valid `?ava_token=` | 302 that sets `ava_session`, then the console loads |
| `GET /svc/*` with a valid cookie | 200 |
| Tampered token signature | denied with `bad_sig` |
| Expired token | denied with `expired` |

The tampered and expired cases matter: they are what distinguish a working HMAC check from a
cookie-presence check.

**Step 4 — only then commit and, if desired, redeploy for demos.**

### 1.5 Alternative considered

A basic-auth CloudFront function, defined in Terraform, would remove the Control Plane dependency and
is quicker. It is weaker (a shared password, no per-user identity, no expiry) and diverges from the
AVA standard used by other FSI Foundry UIs. Recommended only as an explicitly temporary measure, and
still requires Step 2 — otherwise the APIs stay open regardless.

---

## 2. Other open issues

### 2.1 UI hosting infrastructure is never applied by the deploy

`deploy.sh` step 5/5 builds the bundle, and now publishes it, but nothing applies
`iac/terraform/ui`. In an account where that infrastructure does not yet exist the publish step fails
loudly with instructions rather than silently succeeding. A clean-account deploy therefore needs one
deliberate `cd iac/terraform/ui && terraform apply`. Folding this into `deploy.sh` was left out on
purpose: the module's destroy/apply behaviour had not been reviewed, and Step 2 above will change it.

### 2.2 The deployed Control Plane is behind the repo

Beyond the signing secret, the deployed CP predates the S3-delivered buildspec (added because inline
buildspecs are capped at 25.6 KB and ours now exceeds it), the `organization_design` table and the
APVO resources. The buildspec bucket and object were applied and the project repointed at the S3
object; the rest is pending. Treat this as a deliberate CP upgrade, not something to piggyback on a
use-case deploy.

### 2.3 Retained DynamoDB tables after teardown

`hitl-pending-reviews`, `hitl-audit-log` and `kyc-metrics-history` survived deletion of their
CloudFormation stacks, while every other table went with its stack — they almost certainly carry
`DeletionPolicy: Retain`. Two consequences: teardown leaves seeded demo data behind, and the names are
not use-case-prefixed, so `hitl-*` reads like shared infrastructure. Decide whether retention is
intended and prefix the names if not.

### 2.4 Deployment archive buckets accumulate

Every Control Plane deployment creates an `fsi-*` S3 bucket holding the packaged archive, including
failed attempts. Seven exist for this use case alone. Nothing reaps them and `destroy.sh` does not own
them.

### 2.5 The runtime log group is replaced on every deploy

`aws_cloudwatch_log_group.agentcore_runtime` takes its name from the AgentCore runtime id, which comes
from a CloudFormation stack output. The stack updates on every deploy because the image tag is
timestamped, so the name is "known after apply" and Terraform plans a replacement — discarding the
agent's log history each time even though the name resolves to the same value. Fixable with
`ignore_changes` on the name, at the cost of going stale if the runtime is genuinely recreated.

### 2.6 Cedar is not the runtime decision path

Unchanged from the original design: `policy-cascade` computes the tri-state verdict, while
`is_authorized` is called only by `cedar-proxy` for the console. Cedar's `APP-006` threshold and the
config-store threshold can drift apart. The console's live-verification calls in Basic mode use
scenario fixtures rather than the real assessment output — they demonstrate the controls, they do not
gate the decision.

### 2.7 Undeployable sibling templates

`payments-fraud` and `sales-recommend` have no `jobs[]` in their `template.json` and cannot be
deployed from the Control Plane UI. Pre-existing, unrelated to this port, and cheap to fix.

---

## 3. Platform bugs found and fixed during this work

These were found via this use case but are **not** specific to it. All are in the working tree and
need review.

| Bug | Impact | Fix |
|---|---|---|
| `zip_service.py` recorded mode `0600` on every archive entry | CodeBuild unzips as root, so any container running as non-root cannot read its own files. Broke the agent with `PermissionError: /app/main.py`. Affected **every** archive-based deployment; the buildspec's `chmod +x deploy.sh` was a workaround for the same defect | Stamp real Unix modes (0755 for `.sh` and shebang files, 0644 otherwise), `create_system=3` so `unzip` honours them, per-entry `ZIP_DEFLATED` |
| Buildspec ignored `destroy.sh`'s exit code | A failed teardown was reported as `destroyed`, so resources kept running while the operator believed they were gone | Honour the exit code; mark `failed` and exit non-zero |
| CodeBuild image ships Node 18 | Vite 8 requires `^20.19 \|\| >=22.12`; UI builds failed. Repo standard is Node >= 22 | Pin Node 22 by direct download in the install phase, architecture derived from `uname -m` |
| CodeBuild role had no Verified Permissions access | Cedar policy load failed; a swallowed error made an unreadable store look empty | Add `verifiedpermissions:*` and `cloudformation:ListExports`/`ListImports` |
| `destroy.sh` ran Terraform with no `init`, no remote backend, and swallowed failures | Deleted the CloudFormation half while orphaning runtime, role, ECR repo and buckets — and reported success | Init against remote state, bridge CLI credentials for the provider, fail loudly, tear down the UI too, empty versioned buckets and ECR before destroy, preserve account-wide resources by default |

Note on the last row: the Terraform AWS provider does not understand the CLI's `login_session`
authentication (`aws login`). Scripts that invoke Terraform must bridge credentials with
`aws configure export-credentials --format env`, or the provider falls through to EC2 IMDS and fails
with "No valid credential sources found".

---

## 4. Deliberate design decisions worth knowing

- **State key is stable, not per-deployment.** `sales-recommend` scopes state per `DEPLOYMENT_ID` so
  parallel deploys cannot clobber each other. This use case must not: its resource names are fixed
  (IAM role, ECR repo, AgentCore runtime name), so a per-deployment key hands every redeploy an empty
  state and it collides with what already exists. A stable, framework-scoped key lets a redeploy
  converge on the running deployment.
- **Observability defaults to on.** `enable_agentcore_observability`, `create_fleet_dashboard` and
  `enable_xray_transaction_search` default true, matching `market-surveillance`, which creates the
  equivalent resources unconditionally. Two of those resources are account-wide — the
  `AgentCoreObservabilityXRayAccess` X-Ray policy and the `AVA-AgentCore-Fleet` dashboard — so
  defaulting them off would make a redeploy delete plumbing other runtimes depend on. For the same
  reason `destroy.sh` preserves them unless `--include-shared` is passed.
- **`use_case_name` is passed explicitly.** `agentcore_runtime.yaml` maps that parameter — not
  `use_case_id` — onto the container's `USE_CASE_ID`, `AGENT_NAME` and `DATA_PREFIX`. It previously
  defaulted to `kyc_banking`, so the runtime started looking for a use case absent from its image and
  failed to start.
- **Vendored foundations.** The port copies the shared FSI Foundry Terraform and agent scaffolding so
  the use case is self-contained. This is in tension with invariant MUST NOT #6 (do not rebuild what
  exists) and is tracked as deliberate debt in the use-case README.
