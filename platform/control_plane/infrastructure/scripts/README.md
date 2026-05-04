# Control Plane Infrastructure Scripts

Shell and Python scripts for deploying, tearing down, and seeding the Control Plane infrastructure. Every script in this directory is safe to run from any working directory — they `cd` to the infrastructure root before invoking Terraform.

## Scripts at a Glance

| Script | Purpose | When to run |
|--------|---------|-------------|
| [`deploy-full.sh`](#deploy-fullsh) | End-to-end deployment — infra + backend image + frontend + Cognito user | First-time deployment, or after pulling new code |
| [`deploy.sh`](#deploysh) | Infrastructure only (Terraform plan/apply with env var loading) | When you only need to update the infra, not the app |
| [`destroy.sh`](#destroysh) | Tear down everything this Terraform state owns | End of project, or resetting a dev environment |
| [`import-existing.sh`](#import-existingsh) | Import pre-existing AWS resources into Terraform state | Recovering from partial failures or adopting manually-created resources |
| [`seed-codecommit.sh`](#seed-codecommitsh) | Wrapper around the Python seeder (checks deps, forwards args) | Whenever you enable or refresh the "Deploy from Git" path |
| [`seed-codecommit-templates.py`](#seed-codecommit-templatespy) | Discovers FSI Foundry use cases + reference implementations and seeds one CodeCommit repo per item | Called by `seed-codecommit.sh`; can also be run directly |
| [`setup-dockerhub-auth.sh`](#setup-dockerhub-authsh) | Store Docker Hub credentials in Secrets Manager to avoid pull rate limits | Before first foundation stack deployment (optional) |

## Prerequisites

- AWS credentials configured (via `~/.aws/credentials`, env vars, or IAM role)
- Terraform ≥ 1.5
- Docker with buildx (for `deploy-full.sh`)
- Node.js ≥ 22 (for `deploy-full.sh`)
- Python 3.11+ with `boto3` (auto-installed by `seed-codecommit.sh` if missing)
- `jq`

---

## `deploy-full.sh`

One-command deployment of the entire Control Plane. Runs six phases in sequence and never prompts except for the final apply confirmation.

**What it does**

1. **Preflight** — verifies AWS credentials, Docker, Terraform, Node.js are all available
2. **Infrastructure** — `terraform init / plan / apply` of every module in this directory
3. **Backend image** — builds the linux/amd64 Docker image from `platform/control_plane/backend/Dockerfile` and pushes to ECR
4. **ECS rolling deploy** — `force-new-deployment` on the service so tasks pick up the new image
5. **Frontend build** — generates `.env.production`, runs `npm install` + `vite build`, syncs to the frontend S3 bucket, invalidates CloudFront
6. **Cognito user** — optional; prompts for an email and creates a user with a temporary password

**Stale-state safeguard.** Before running Terraform, the script inspects `terraform.tfstate` for resource ARNs that belong to a different AWS account than the one currently authenticated. If it finds a mismatch, it offers to back up and reset the state — handy when switching accounts.

**Usage**
```bash
cd platform/control_plane/infrastructure/scripts
./deploy-full.sh
```

Expected duration: ~10–15 minutes on a fresh account.

---

## `deploy.sh`

Infrastructure-only Terraform deploy. Loads values from `.env` and runs `init / plan / apply`. Use this when you've already built and pushed the backend image and just want to roll infra changes.

**What it does**

1. Sources `.env` (creates it from `.env.example` on first run)
2. Verifies `AWS_REGION` and `ENVIRONMENT` are set
3. Runs `aws sts get-caller-identity` to confirm credentials
4. Creates `terraform.tfvars` from the example if missing, pulling values from `.env` via `sed`
5. `terraform init` → `validate` → `plan -out=tfplan`
6. Prompts for confirmation, then `terraform apply tfplan`
7. Prints key outputs (ECR URL, API endpoint, frontend URL, Cognito pool ID, CodeCommit clone URL)

**Usage**
```bash
cd platform/control_plane/infrastructure/scripts
./deploy.sh
```

---

## `destroy.sh`

Tears down every resource this Terraform state owns. Double-confirms before proceeding and empties S3 buckets first so the destroy doesn't stall on non-empty bucket errors.

**What it does**

1. Prints the list of resources about to be destroyed
2. First confirmation: type `yes`
3. Second confirmation: type `destroy`
4. Empties `project_archives` and `frontend` S3 buckets via `aws s3 rm --recursive`
5. Runs `terraform destroy`

**Usage**
```bash
cd platform/control_plane/infrastructure/scripts
./destroy.sh
```

**Warning** — this deletes DynamoDB tables, Cognito user pool (and users), Step Functions state machine, all logs, and Terraform-created networking. It does **not** delete CodeCommit repositories created by `seed-codecommit.sh` (those are outside this Terraform state; delete them manually via `aws codecommit delete-repository` if needed).

---

## `import-existing.sh`

Imports pre-existing AWS resources into Terraform state so a subsequent `apply` doesn't try to recreate them. Useful after a partially-failed deploy, or when adopting resources that were created manually.

**What it imports** (all guarded so they skip missing resources):

- CloudWatch log groups (API Gateway, CodeBuild, ECS, Step Functions)
- IAM roles (CodeBuild, Cognito authenticated, ECS task execution/task, EventBridge, Step Functions)
- DynamoDB tables (app factory, application catalog, deployment metadata, deployments, TF lock)
- ECR repository
- S3 buckets (project archives, frontend, deployments, TF state)
- EventBridge event bus
- CloudFront OAC
- Cognito User Pool Domain
- CloudWatch Logs Insights query definitions
- ECS Cluster
- SQS DLQ
- VPC (only if using an existing VPC)

**Usage**
```bash
cd platform/control_plane/infrastructure/scripts
./import-existing.sh
```

After import, run `terraform plan` to verify the imported state matches the current config, then `terraform apply` to reconcile any drift.

---

## `seed-codecommit.sh`

Shell wrapper around `seed-codecommit-templates.py`. Handles AWS credential checks, boto3 installation, and argument forwarding.

**What it does**

1. Verifies `aws sts get-caller-identity` succeeds
2. Installs `boto3` via `pip3` if not already present
3. Resolves its own absolute path (works from any cwd)
4. Invokes the Python seeder with `--mode`, `--region`, and optional `--dry-run`

**Usage**
```bash
cd platform/control_plane/infrastructure/scripts

# Preview (safe, no changes made)
./seed-codecommit.sh init --dry-run

# Actually create repositories
./seed-codecommit.sh init

# Force-push latest source into existing repos
./seed-codecommit.sh sync
```

**Environment**
- `AWS_REGION` — target region for CodeCommit (defaults to `us-east-1`)

---

## `seed-codecommit-templates.py`

The Python seeder that actually talks to CodeCommit. Discovers all FSI Foundry use cases and reference implementations and creates one CodeCommit repo per item.

### What gets discovered

Two sources, both in one pass:

1. **Reference implementations** — every directory under `applications/reference_implementations/` that contains a `template.json`.
2. **FSI Foundry use cases** — every `use_cases[]` entry in `applications/fsi_foundry/data/registry/offerings.json` whose `application_path` exists on disk.

### Naming convention

| Source | Repo name pattern | Example |
|--------|-------------------|---------|
| Reference implementation | `fsi-foundry-use-case-<id>` | `fsi-foundry-use-case-shopping-concierge-agent` |
| FSI Foundry use case | `fsi-foundry-<use_case_name>` | `fsi-foundry-fraud_detection` |

### Bundle layout (FSI Foundry)

Each seeded Foundry repo mirrors the layout that the Quick Deploy (S3) path packages on demand, so CodeBuild's buildspec can run the same stages regardless of source:

```
fsi-foundry-<use_case>/
├── README.md                   # Auto-generated deployment guide
├── .gitignore
├── template.json               # Synthesized metadata
├── infra/                      # Terraform — ECR, S3, IAM, networking
├── runtime/                    # Terraform — AgentCore Runtime via CloudFormation
├── ui_iac/                     # Terraform — S3, CloudFront, Lambda, API Gateway (renamed from foundations/iac/agentcore/ui)
├── shared/                     # Shared Terraform modules
├── docker/                     # Dockerfile.agentcore + build context
├── app_src/                    # foundations/src — base classes, adapters, tools
├── use_cases/<use_case>/src/   # Use-case-specific agents and orchestrator
├── ui/<use_case>/              # Per-use-case React frontend
└── data/samples/               # Sample data for test invocations
```

Reference-implementation repos keep their source directory's native layout — they each ship their own `deploy.sh` that CodeBuild runs directly.

### Modes

```bash
python3 seed-codecommit-templates.py --mode init --region us-east-1
python3 seed-codecommit-templates.py --mode sync --region us-east-1
python3 seed-codecommit-templates.py --mode init --dry-run
```

| Mode | Behavior |
|------|----------|
| `init` | Creates repos that don't exist; force-pushes latest source to every repo |
| `sync` | Same as `init` in the current implementation (idempotent) — use when refreshing content after a code change |
| `--dry-run` | Prints what would happen without calling CodeCommit or pushing anything |

### When to re-sync

Run `./seed-codecommit.sh sync` whenever source that ends up inside the bundle changes. Common triggers:

- Bedrock model bump (e.g. Sonnet → Haiku) — configs are baked into the bundle
- Changes to `applications/fsi_foundry/foundations/` (shared code, IaC, docker)
- Changes to `applications/fsi_foundry/use_cases/<name>/src/` or `applications/fsi_foundry/ui/<name>/`
- Adding a new entry to `offerings.json`

---

## How these scripts fit into the bigger picture

Once `deploy-full.sh` has run, most day-to-day operations happen through the Control Plane UI. The only script you'll likely re-run is `seed-codecommit.sh sync` after code changes that need to reach Git-path deployments.

See:
- [Infrastructure README](../README.md) — module layout, outputs, per-module docs
- [Platform Architecture](../../../docs/architecture/platform-architecture.md) — end-to-end system design with Mermaid diagrams
- [CI/CD Pipeline](../../../docs/architecture/cicd-pipeline.md) — CodeBuild phases, env vars, dual-source flow

## `setup-dockerhub-auth.sh`

Stores Docker Hub credentials in AWS Secrets Manager so that CodeBuild can authenticate before pulling images during foundation stack deployment. This avoids Docker Hub's unauthenticated rate limit (100 pulls/6hrs) which frequently causes deployment failures.

**This is optional** — deployments work without it but may fail with `toomanyrequests` errors. With a free Docker Hub account, the rate limit doubles to 200 pulls/6hrs.

**Setup steps**

1. Create a free Docker Hub account at https://hub.docker.com/signup (or use an existing one)
2. Create a read-only access token:
   - Go to https://hub.docker.com/settings/security
   - Click **New Access Token**
   - Name: `codebuild-pull` (or any name)
   - Permissions: **Read-only**
   - Click **Generate** and copy the token
3. Run the script:

```bash
cd platform/control_plane/infrastructure/scripts
./setup-dockerhub-auth.sh
```

Or non-interactively:

```bash
./setup-dockerhub-auth.sh --username myuser --token dckr_pat_xxx --region us-east-1
```

**What it does**

1. Verifies the credentials work against Docker Hub
2. Creates (or updates) a Secrets Manager secret named `dockerhub-credentials`
3. The foundation stack's Terraform checks for this secret before pulling images — if found, it authenticates; if not, it pulls unauthenticated

**When to run** — Once per AWS account, before the first foundation stack deployment. The secret persists across deployments.

---

## Troubleshooting

**"AWS credentials not configured"** — Run `aws sts get-caller-identity` first. If it fails, set `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` (+ `AWS_SESSION_TOKEN` if using SSO), or `aws configure`.

**"State references a different account"** — `deploy-full.sh` offers to back up and reset when it sees mismatched ARNs. Accept, or manually `mv terraform.tfstate terraform.tfstate.backup.<old-account>` and rerun.

**Seeding crashes on an individual template** — The Python script will stop by default (`raise` in the exception handler). Use `--dry-run` to locate which template fails, then fix its source layout. All seeded repos are idempotent — re-running picks up where it left off.

**"Template not found" when deploying from Git** — The CodeCommit repo doesn't exist yet. Run `./seed-codecommit.sh init` once, or `sync` if it was deleted manually.

**Foundation stack 503 / "toomanyrequests" from Docker Hub** — The Langfuse deployment pulls images from Docker Hub, which rate-limits unauthenticated pulls. Run `./setup-dockerhub-auth.sh` to store Docker Hub credentials, then redeploy. Alternatively, push images manually: `docker tag langfuse/langfuse:3.161.0 <ECR_URL>:3.161.0 && docker push <ECR_URL>:3.161.0` (repeat for langfuse-worker and clickhouse).

**Git push to a seeded repo doesn't trigger a deployment** — Check the EventBridge rule `codecommit-push` for that repo is enabled, the `trigger_branches` list in `terraform.tfvars` includes your branch, and Step Functions has a valid target mapping. CloudWatch Logs on Step Functions will show the event payload if it fired but failed to start.
