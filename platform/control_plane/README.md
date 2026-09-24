# AVA Control Plane

The Agentic Value Accelerator (AVA) Control Plane is a full-lifecycle platform for deploying, securing, and governing AI agent applications on AWS.

## Architecture

```
control_plane/
├── backend/           # FastAPI backend (Python 3.12)
├── frontend/          # React + TypeScript + Vite
├── docs/              # Platform documentation
├── infrastructure/    # Terraform root module + the Govern IAM role
│   ├── environments/  #   per-environment Terraform (dev, ...)
│   ├── modules/       #   reusable Terraform modules
│   ├── bootstrap/     #   remote-state backend bootstrap
│   └── iam/           #   ava-govern-role.yaml (CloudFormation)
└── templates/         # Agent deployment templates
```

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+
- AWS CLI configured with credentials
- AWS account with Bedrock access

### Local Development

**Backend:**
```bash
cd backend
python -m venv venv312
source venv312/Scripts/activate  # Windows: venv312\Scripts\activate
pip install -r requirements.txt
python -m uvicorn src.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Access the UI at http://localhost:3000

### Environment Variables

**Backend:**
```bash
# Two regions, deliberately. These answer different questions - see below.
AWS_REGION=us-east-2              # Control plane: AVA's own DynamoDB tables + infrastructure
GOVERN_AWS_REGION=us-east-1       # Governed fleet: the customer's Bedrock agents, AgentCore
                                  # runtimes, guardrails, and the CloudWatch metrics they emit

# Optional region overrides. Empty means AWS_REGION.
CONTROL_PLANE_TABLE_REGION=       # Relocates EVERY control-plane table at once

# Relocate ONE table: <TABLE_KEY>_TABLE_REGION, where <TABLE_KEY> is the settings
# prefix before _TABLE_NAME (GOVERN_OPERATIONS_TABLE_NAME -> GOVERN_OPERATIONS).
GUARDRAILS_TABLE_REGION=us-east-1 # The one override actually set in docker-compose.yaml:
                                  # this table is declared in the us-east-2 Terraform root
                                  # but lives in us-east-1. Without the override it
                                  # resolves to AWS_REGION and reads as an empty table.
GOVERN_OPERATIONS_TABLE_REGION=
GOVERN_COMPLIANCE_TABLE_REGION=
FINOPS_SPEND_TABLE_REGION=

AWS_PROFILE=your-profile          # Optional: CLI profile name
DATABASE_URL=sqlite:///./control_plane.db
```

**Why these are separate fields.** They used to be one, and the failure mode is
**silent**. An AWS API call against the wrong region does not raise - it succeeds and
returns that region's smaller or empty inventory. The Operations Hub reported a
**1-agent fleet instead of the real 36** under a Live badge, because it built its fleet
clients from the incidents table's region. Get `AWS_REGION` and `GOVERN_AWS_REGION`
backwards and you get a plausible-looking dashboard full of wrong numbers, not an error.

Resolution order for a table's home region, most specific first:

1. `<TABLE_KEY>_TABLE_REGION` - relocate one table
2. `CONTROL_PLANE_TABLE_REGION` - relocate every table at once
3. `AWS_REGION` - the control-plane region

Implemented by `region_config.table_region()` in `backend/src/core/region_config.py`.
Resolution is **configured, never discovered**: probing candidate regions for a matching
table name would silently pick one, and a control-plane table picked at random is a
split-brain write target.

Two control-plane tables resolve their region this way and are worth calling out:

| Table | Holds | Note |
|---|---|---|
| `fsi-control-plane-govern-operations` | Incidents, alerts, SLAs, changes | Renamed from `ava-operations-incidents`, which never existed in any region. Not aliased. |
| `fsi-control-plane-govern-compliance` | Control attestations and evidence | Previously hardcoded as `ava-govern-compliance` in us-east-1, which existed in NEITHER region - so every attestation lived in process memory and died on restart. |

**Pinned services are a third case.** botocore auto-pins `ce` (Cost Explorer),
`budgets`, `organizations`, and `iam` to a single endpoint, so the region passed to them
is ignored. `health` and `support` are NOT auto-pinned and a wrong region is a real
failure, so they need an explicit pin. Both cases go through
`region_config.resolve_service_region()`.

See `backend/src/core/config.py` for all configuration options.

#### The governed-fleet region is asked for, not defaulted

Because a wrong tier-2 region produces no error to read, the deployment path states it in
three places rather than leaving it to a default nobody sees:

| Where | What happens | If you skip it |
|---|---|---|
| `terraform plan/apply` | `var.govern_aws_region` has **no default**, so Terraform prompts. The prompt text is the variable's `description`. A `validation` block rejects a malformed region such as `us-east1`. | `-input=false` / CI fails, naming the variable. That is intentional: a pipeline that has not decided which region it governs should stop, not guess. |
| `scripts/deploy.sh local` | Prompts once when `GOVERN_AWS_REGION` is set neither in the shell nor in `.env`, writes the answer to `.env` (gitignored), then prints the resolved three tiers straight out of `docker compose config`. | Non-interactive stdin warns and continues, naming the region it fell back to. |
| Backend startup | `region_config.log_resolution()` logs all three tiers with each value marked STATED or INHERITED, and warns when the fleet region was never stated and nothing is persisted. | Nothing - it always runs. `docker compose logs backend \| grep REGION-TIER` reprints it. |

Pressing Enter at either prompt is still valid and means "the AI estate is in the
control-plane region", which is right for most single-region deployments. The point is that
it is now a decision rather than an omission. `terraform output region_resolution` reprints
the Terraform-side answer at any time.

Two regions that differ is not a warning sign by itself - the demo account runs its control
plane in `us-east-2` and its Bedrock estate in `us-east-1`, and must pass
`-var govern_aws_region=us-east-1 -var guardrails_table_region=us-east-1`.

#### Authentication: `ENVIRONMENT` decides whether the dev bypass is even offered

```bash
ENVIRONMENT=production            # Anything outside the dev set disables the auth bypass
USE_DEV_AUTH=false                # Ignored entirely unless ENVIRONMENT is a dev value
DEBUG=false
```

`USE_DEV_AUTH` is not a convenience flag. `core/dev_auth.py` never reads the credential it
is handed - it returns a hardcoded admin - so the flag *is* the authentication decision.
Its default is `True`, which means the dangerous case was never "someone switched auth
off", it was **"nobody switched it on"**, and a working bypass is indistinguishable from
working auth from the outside. `core/auth.py` also used to switch on
`USE_DEV_AUTH or DEBUG`, so `DEBUG=true` was a second door to the same room.

Both are now gated on `ENVIRONMENT`. The bypass is permitted only when `ENVIRONMENT` is
one of `development`, `dev`, `local`, `test` (case- and whitespace-insensitive). Anything
else - including an empty value, a typo, and dev-*looking* values such as `dev-2` or
`development-eu` - fails closed, and the resolution is logged either way:

```
docker compose logs backend | grep AUTH-GATE
```

| Deployment | `ENVIRONMENT` | Result |
|---|---|---|
| `docker-compose.yaml` | not set, so the `development` default applies | Bypass active, as before |
| `infrastructure/environments/dev` | not set either - this root defines its own `aws_ecs_task_definition.backend` rather than going through the ECS module, and only sets `USE_DEV_AUTH=true` | Bypass active, as before, but *because of the default*. If you add an explicit `ENVIRONMENT` to that task definition it must be a value from the dev set or the bypass stops. |
| `infrastructure/modules/ecs` (staging, production) | `var.environment` | Bypass refused unless `var.environment` happens to be a dev value; Cognito JWT validation is the only path |

Tests: `backend/tests/test_auth_gate.py`.

#### Outbound HTTP: `SAFE_FETCH_ALLOWED_PRIVATE_CIDRS`

```bash
# Empty by default. Comma-separated CIDRs, IPv4 or IPv6.
SAFE_FETCH_ALLOWED_PRIVATE_CIDRS=10.20.0.0/16,192.168.50.0/24
```

Every outbound fetch of a **caller-supplied** URL - an A2A agent card, an OIDC discovery
document, a ServiceNow or Salesforce instance - goes through `core/safe_fetch.py`, which
resolves the host, refuses any address that is not publicly routable, then connects to
that exact validated address so a second DNS answer cannot redirect the request
(rebinding). Cross-host redirects drop the `Authorization` header, which `urllib`'s
redirect handler does not do.

That correctly refuses a **legitimate** target too: an OIDC issuer or agent peer on a
private VPC or on-prem address. This setting is the supported way to permit those,
because the alternative operators reach for is patching the guard out. Entries relax only
the private, reserved, and CGNAT rules. **No entry can ever permit loopback, link-local,
multicast, or the unspecified address** - `0.0.0.0/0` does not unlock `169.254.169.254`,
and an IPv6 address is unwrapped before matching so a NAT64- or v4-mapped form of the
instance metadata endpoint cannot be smuggled past it either. A malformed entry is logged
and skipped rather than raised, so a typo cannot take down JWT verification.

Known limitation, deliberate: `HTTP_PROXY`/`HTTPS_PROXY` are **not** honoured on these
paths. Through a proxy the client never resolves the target, so there is no address to
validate and none to pin, and the guarantee could not be made. Nothing in this repo's
compose files, Terraform, or Dockerfiles sets those variables.

Tests: `backend/tests/test_safe_fetch.py`.

## Modules

AVA is organized into four pillars:

| Pillar | Purpose | Key Modules |
|--------|---------|-------------|
| **Plan** | Strategy & prioritization | Use Cases, Business Cases, Maturity, Operating Model |
| **Build** | Development & deployment | App Factory, Deployments, Knowledge Bases |
| **Secure** | Safety & compliance | Guardrails, Policies, Service Approvals |
| **Govern** | Visibility & control | Command Center, Agent Registry, FinOps, Compliance |

### Govern Module Highlights

The Govern module provides AI GRC (Governance, Risk, Compliance) capabilities:

**Core (See It / Govern It / Show It):**
- Command Center — Executive dashboard
- Agent Registry — Multi-cloud agent inventory
- Model Management — Model catalog, LLM monitoring patterns
- Cost & FinOps — AWS Cost Explorer, capacity management
- Compliance Center — 14 regulatory frameworks, 281 controls (24 assessed today, all by
  auto-detection; those probes test existence, not efficacy)
- Audit & Incidents — CloudTrail integration

**Recent Additions:**
- **Capacity Management** — AWS Service Quotas monitoring for AI services
- **LLM Monitoring Patterns** — CloudWatch-based LLM quality monitoring
- **Path Jailing** — Block AI tool access to sensitive paths
- **Policy-Reality Drift** — Detect governance policy violations

See `frontend/src/components/govern/README.md` for full documentation.

## AWS Integration

AVA integrates with 20+ AWS services for live data:

| Service | Purpose |
|---------|---------|
| Bedrock | Models, Agents, Guardrails, Evaluations |
| CloudTrail | AI activity audit trail |
| CloudWatch | Metrics, logs, dashboards |
| Cost Explorer | Spend analysis and forecasting |
| AWS Config | Compliance rule status |
| Security Hub | Security findings |
| Service Quotas | Capacity limits |
| Glue | Data catalog |
| SageMaker | ML model inventory |
| IAM | Identity and access |

### IAM Permissions

See `docs/ava-govern-iam-permissions.md` for required IAM permissions, and
`infrastructure/iam/README.md` for per-compute-type wiring (ECS, EKS, EC2,
Lambda, App Runner).

`infrastructure/iam/ava-govern-role.yaml` is the **only** role definition in this
repo. The former `infra/cloudformation/ava-govern-iam.yaml` and
`infra/terraform/modules/ava-govern-iam/` were deleted: they granted 88 actions
against this template's 168, so deploying them left the agent registry, AgentCore
posture, model catalog, and compliance surfaces `live: false`.

That 168 is 162 read-only actions plus the 6 under `AVAGovernWriteActions`, which
is gated on the `EnableWriteActions` parameter and **defaults to `false`** — so a
default deployment grants the 162 read-only actions across 34 service prefixes,
with no wildcard actions.

**Deploy:**
```bash
aws cloudformation deploy \
  --template-file infrastructure/iam/ava-govern-role.yaml \
  --stack-name ava-govern-iam \
  --capabilities CAPABILITY_NAMED_IAM
```

Defaults are read-only. Two parameters are worth setting:

| Parameter | Default | Why |
|---|---|---|
| `EvaluationOutputBucketArns` | `''` | Scopes evaluation-output S3 reads to specific buckets. Left empty the statement covers every bucket **in this account** (never cross-account - `aws:ResourceAccount` is unconditional). Pass both `arn:aws:s3:::b` and `arn:aws:s3:::b/*` per bucket. |
| `EnableWriteActions` | `'false'` | Opt-in write policy: `bedrock:ApplyGuardrail`, CloudWatch metric/alarm/dashboard writes, quota-increase requests. Leave `false` unless you need guardrail testing or alarm provisioning. `s3:PutObject` is never granted. |

## API Documentation

Backend API docs available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- OpenAPI JSON: http://localhost:8000/openapi.json

## Development

### Code Style

- **Python**: Black, isort, ruff
- **TypeScript**: ESLint, Prettier
- **React**: Functional components, hooks
- **UI**: Tailwind CSS, Heroicons (via Icon component)

### Testing

```bash
# Backend
cd backend
pytest
```

`backend/pytest.ini` supplies `testpaths = tests` and `pythonpath = src`, so plain `pytest`
works. Before that file existed this command did not run zero tests, it exited with
`INTERNALERROR` — with no `testpaths` pytest recursed from the CWD, and in the container that
CWD (`/app`) also holds `applications/fsi_foundry`, whose `adapters/__init__.py` imports
`bedrock_agentcore`, a dependency deliberately not installed here.

**Expect a non-zero exit.** Current measured result is **409 passed, 1 skipped, 25 failed, 4
errors**. All failures and errors are pre-existing breakage confined to eight *template*
subsystem modules (none in Govern); `pytest.ini` names each one and its cause. They are left
un-ignored on purpose — a suppressed module reports as a green suite, and a real runtime bug
(`backend/Dockerfile` not copying `schemas/`, which broke `TemplateValidator` in the deployed
image) hid inside the old ignore list for exactly that reason.

For a green gate, skip them explicitly so the output still says what was skipped:

```bash
cd backend
pytest \
  --ignore=tests/test_pipeline_service.py \
  --ignore=tests/test_property_based.py \
  --ignore=tests/test_template_catalog.py \
  --ignore=tests/test_template_job_service.py \
  --ignore=tests/test_iac_filtering.py \
  --ignore=tests/test_iac_filtering_standalone.py \
  --ignore=tests/test_bootstrap_engine.py \
  --ignore=tests/test_template_validator.py
```

The host needs `sqlalchemy` and `hypothesis` installed. To run against the image instead
(no rebuild needed — `src/` and `tests/` are bind-mounted over it):

```bash
cd platform/control_plane
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps \
  -v "$PWD/backend/src:/app/src:ro" \
  -v "$PWD/backend/tests:/app/tests:ro" \
  -v "$PWD/backend/pytest.ini:/app/pytest.ini:ro" \
  --entrypoint sh backend -c 'cd /app && python -m pytest -q'
```

```bash
# Frontend
cd frontend
npm run test       # vitest --run
npm run typecheck  # tsc -p tsconfig.app.json --noEmit  <- the real type gate
npm run build      # vite build; bundles only
```

`npm run build` is **not** a type check. It is `vite build`, which transpiles through esbuild
and strips types without ever checking them, so it happily emits a bundle from code `tsc`
rejects. `npm run typecheck` is the gate. This is also why the frontend Dockerfile — which
only `COPY`s a host-built `dist/` — cannot catch a type error for you.

### Adding New Features

1. **Backend route**: Add to `backend/src/api/routes/`
2. **Service**: Add to `backend/src/services/`
3. **API client**: Add types and functions to `frontend/src/api/client.ts`
4. **Component**: Add to appropriate module directory
5. **Route**: Register in `frontend/src/App.tsx`
6. **Documentation**: Update module README and `/docs` page

## Deployment

### ECS Fargate

Deploy `infrastructure/iam/ava-govern-role.yaml` with `ComputeType=ecs` to create
the task role, then deploy via ECS. See `infrastructure/iam/README.md` for the
task-definition wiring. (There is no Terraform module; it was deleted as an
incomplete duplicate.)

### Lambda

Attach the IAM policy to your Lambda execution role.

See `infrastructure/README.md` for detailed deployment instructions, and
`infrastructure/iam/README.md` for wiring the Govern role to your compute type.

## Documentation

- **In-app docs**: Navigate to `/docs` in the UI
- **Govern module**: `frontend/src/components/govern/README.md`
- **IAM permissions**: `docs/ava-govern-iam-permissions.md`
- **Infrastructure**: `infrastructure/README.md`
- **Govern IAM role**: `infrastructure/iam/README.md`

## License

Proprietary - AWS Professional Services
