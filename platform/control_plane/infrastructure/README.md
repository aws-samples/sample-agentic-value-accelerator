# Control Plane Infrastructure

This directory contains Terraform configuration for deploying the AVA Control Plane infrastructure on AWS.

## Architecture

The infrastructure includes:

- **API Gateway**: HTTP API with VPC Link for private integration
- **ECS Fargate**: Containerized backend service with auto-scaling
- **DynamoDB**: 17 control-plane tables from `modules/dynamodb`, each named `<name_prefix>-*` — `app-factory`, `application-catalog`, `deployment-metadata`, `deployments`, `guardrails`, `policies`, `prioritization`, `maturity`, `business-cases`, `knowledge`, `operating-model`, `organization-design`, `mcp-servers`, `identity-providers`, `approval-policies`, `approval-requests`, `a2a-agents`. All 17 set `point_in_time_recovery { enabled = true }`. Note that **no Govern table is declared in this module** — the 11 `fsi-control-plane-*` tables the Govern module reads and writes live in `environments/dev/main.tf` and are documented in [environments/dev/README.md](environments/dev/README.md). Each has its own home region (see [Region model](#region-model-three-tiers-do-not-collapse-them))
- **S3**: Project archives (Quick Deploy source) and frontend static hosting
- **Step Functions**: CI/CD deployment pipeline orchestration (Validate → Normalize → Build → Monitor → Capture → Record); source-agnostic — drives both S3 archive and CodeCommit-backed deployments
- **CodeBuild**: Dual-source IaC execution in isolated Docker containers (Terraform, CDK, CloudFormation). Clones from CodeCommit *or* unzips an S3 archive based on Step Functions input
- **CodeCommit**: Pre-seeded `fsi-foundry-*` repositories — one per FSI Foundry use case + one per reference implementation — that back the frontend's "Deploy from Git" option. Seeded via `scripts/seed-codecommit.sh init`
- **EventBridge**: Deployment lifecycle events with dead-letter queue, plus per-repo git push / PR-merge rules that auto-trigger Step Functions
- **State Backend**: Terraform remote state (S3 + DynamoDB locking) per deployment
- **CloudFront**: CDN for frontend distribution
- **Cognito**: User authentication and authorization
- **CloudWatch**: Logs, metrics, alarms, and dashboards
- **ECR**: Container registry for backend Docker images
- **VPC** (Optional): Can use existing VPC or create new one

## Region model (three tiers, do not collapse them)

"Region" is three unrelated questions in this platform, and they are resolved
separately in `backend/src/core/region_config.py`. They used to share a single
`region` field, and the failure mode was silent rather than loud: an AWS API call
against the wrong region *succeeds* and returns that region's smaller or empty
inventory instead of raising. That is how the Operations Hub reported a 1-agent
fleet when the real fleet was 36 — under a Live badge.

| Setting | Tier | Points at | Demo account |
|---------|------|-----------|--------------|
| `AWS_REGION` | 1 — control plane | AVA's own DynamoDB tables and infrastructure | `us-east-2` |
| `GOVERN_AWS_REGION` | 2 — governed fleet | The governed estate: Bedrock agents, AgentCore runtimes, guardrails, and the CloudWatch metrics they emit | `us-east-1` |
| `CONTROL_PLANE_TABLE_REGION` | 1 — override | Relocates **every** control-plane table at once. Empty means `AWS_REGION` | unset |
| `<TABLE_KEY>_TABLE_REGION` | 1 — override | Relocates **one** table. `<TABLE_KEY>` is the settings prefix before `_TABLE_NAME`, e.g. `GOVERN_OPERATIONS_TABLE_REGION`, `GOVERN_COMPLIANCE_TABLE_REGION`, `FINOPS_SPEND_TABLE_REGION` | `GUARDRAILS_TABLE_REGION=us-east-1` |

A control-plane table's home region resolves most-specific-first through
`region_config.table_region()`:

```
<TABLE_KEY>_TABLE_REGION  →  CONTROL_PLANE_TABLE_REGION  →  AWS_REGION
```

Resolution is **configured, never discovered**. Probing candidate regions for a
matching table name was considered and rejected: if the same name exists in two
regions, discovery silently picks one, and a control-plane table (read-write)
picked at random is a split-brain write target.

**Tier 3 — global and pinned services**, via `region_config.resolve_service_region()`.
Two sub-cases that are not interchangeable:

- botocore auto-pins the endpoint for `ce`, `budgets`, `organizations`, and `iam`, so
  whatever region you pass is ignored. Cost Explorer and Budgets fall here — passing a
  governed region is harmless but misleading, because it implies a per-region call that
  cannot happen.
- botocore does **not** auto-pin `health` or `support`, so a wrong region there is a
  real failure. These need the explicit pin.

Coverage gap, verified by grep over this directory: nothing under `infrastructure/`
references `GOVERN_AWS_REGION`, `CONTROL_PLANE_TABLE_REGION`, or any `*_TABLE_REGION`.
This IaC wires `AWS_REGION` only (`environments/dev/main.tf` sets it to `us-east-2` in
the backend task definition). Tier 2 and the per-table overrides currently come from
the defaults in `backend/src/core/config.py`, or from `docker-compose.yaml` for local
runs.

## Known state and coverage caveats

Recorded rather than hidden — read these before trusting a `terraform plan` from
this tree.

- **There is no `terraform.tfstate` anywhere under `infrastructure/`.** The root stack's
  `backend "s3"` block in `main.tf` is commented out, and `environments/dev/backend.tf`
  declares `backend "local"` with no state file present. Verification of this tree is
  therefore limited to `terraform init -backend=false`, `terraform fmt -check`, and
  `terraform validate` — **`terraform apply` has never been run from it.** Resources
  that already exist in AWS, including the two new Govern tables, exist in no state
  file, so a first `apply` would attempt to create rather than adopt them; they need
  `terraform import` first.
- **State divergence:** `fsi-control-plane-guardrails` is declared in the us-east-2
  `environments/dev` root but actually lives in us-east-1. That is why the running
  backend sets `GUARDRAILS_TABLE_REGION=us-east-1` (see `docker-compose.yaml`).
- **`modules/dynamodb` declares no Govern table.** All 11 `fsi-control-plane-*` tables
  the Govern module uses are declared directly in `environments/dev/main.tf`.
- **PITR on the `environments/dev` tables: 2 of 11 declared, 0 of 11 in effect.**
  `fsi-control-plane-govern-compliance` and `fsi-control-plane-govern-operations` now
  declare `point_in_time_recovery { enabled = true }`, because neither table's contents
  can be regenerated — the first is the store of record for control attestations and
  evidence, the second holds hand-entered incident records. The other nine declare
  nothing and sit at the AWS default of off — the deliberate demo posture, also recorded
  under "Hardening required before production" in the root `SECURITY.md`. The 17 tables in
  `modules/dynamodb` all enable PITR.
  **The two declarations are not yet in effect**: those tables were created outside
  Terraform and are in no state file, so nothing has reconciled the declaration against
  the live tables. That needs `terraform import` plus an apply, or a one-off
  `aws dynamodb update-continuous-backups`. Treat the live tables as PITR-off until then.
- **`deletion_protection_enabled` is unset on all 11**, and on all 17 in
  `modules/dynamodb`, so `terraform destroy` still works for dev teardown. Turn it on
  before this stack backs anything audited.
- Comments in `environments/dev/main.tf` next to the `govern_compliance` and
  `govern_operations` resources name the previous table names on purpose, as historical
  notes explaining why the rename happened. Do not "fix" them.

## Prerequisites

- Terraform >= 1.0
- AWS CLI configured with appropriate credentials
- Docker (for building container images)
- An AWS account with necessary permissions

## Quick Start

### 1. Configure Environment Variables

Copy the example env file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Required
# Tier 1 ONLY: the control-plane region — where AVA's own tables and infra go.
# This does NOT set where the governed fleet lives; that is GOVERN_AWS_REGION,
# read by the backend, not by this Terraform. See "Region model" above. In the
# demo account the control plane is us-east-2 and the governed fleet us-east-1.
AWS_REGION=us-east-1
ENVIRONMENT=dev

# Optional - Use existing VPC (recommended for faster deployment)
VPC_ID=vpc-xxxxx
PUBLIC_SUBNET_IDS=subnet-xxx,subnet-yyy
PRIVATE_SUBNET_IDS=subnet-aaa,subnet-bbb

# Optional - Custom domain
DOMAIN_NAME=ava-platform.example.com
HOSTED_ZONE_ID=Z1234567890ABC
```

### 2. Configure Terraform Variables

Copy the example tfvars file:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your values.

### 3. Initialize Terraform

```bash
terraform init
```

### 4. Review the Plan

```bash
terraform plan
```

### 5. Deploy Infrastructure

```bash
terraform apply
```

This will create all necessary AWS resources. The deployment typically takes 15-20 minutes.

## Using Existing VPC

To use an existing VPC (recommended to avoid long VPC creation time):

1. Set these variables in your `.env` or `terraform.tfvars`:

```hcl
vpc_id             = "vpc-xxxxx"
public_subnet_ids  = ["subnet-xxxxx", "subnet-yyyyy"]
private_subnet_ids = ["subnet-aaaaa", "subnet-bbbbb"]
```

2. Leave them empty to create a new VPC:

```hcl
vpc_id             = ""
public_subnet_ids  = []
private_subnet_ids = []
```

## Enabling the "Deploy from Git" path (CodeCommit)

The Control Plane supports two deployment source modes, and both share the same CodeBuild pipeline:

| Source | UI tab | What gets cloned / unzipped |
|--------|--------|-----------------------------|
| **S3 archive** | Quick Deploy | Backend packages the use case source on demand, uploads to `s3://<project-archives>/deployments/<id>/<name>.zip`, CodeBuild unzips it |
| **CodeCommit** | Deploy from Git | CodeBuild `git clone`s one of the pre-seeded `fsi-foundry-*` repos |

Both paths call the same Step Functions state machine. A `NormalizeBuildInput` pass state fills in empty defaults for whichever fields the chosen source doesn't set, so `InvokeCodeBuild` never fails on a missing JSONPath.

### Seeding CodeCommit (one-time per environment)

Run the seeding script after `deploy-full.sh`:

```bash
cd scripts
./seed-codecommit.sh init
```

This discovers every FSI Foundry use case listed in `applications/fsi_foundry/data/registry/offerings.json` plus every reference implementation under `applications/reference_implementations/`, and creates a CodeCommit repo per item:

- `fsi-foundry-<use_case>` for each of the 34 use cases — e.g. `fsi-foundry-kyc_banking`
- `fsi-foundry-use-case-<ref-impl>` for each reference implementation — e.g. `fsi-foundry-use-case-shopping-concierge-agent`

Each seeded repo is a self-contained deployment bundle (`infra/`, `runtime/`, `ui_iac/`, `ui/<use_case>/`, `shared/`, `docker/`, `app_src/`, `use_cases/<use_case>/src/`, `data/samples/`), mirroring the layout that the S3 path packages on demand.

Re-run `./seed-codecommit.sh sync` whenever the underlying source changes (e.g. after updating the Bedrock model) to force-push fresh content into each repo.

### Using the UI after seeding

1. Sign in to the Control Plane
2. Pick a use case from FSI Foundry
3. On **Deploy Application**, switch to the **Deploy from Git** tab
4. The repo dropdown auto-loads (`GET /api/v1/codecommit/repositories`) and selects the one matching the use case
5. Optionally change the branch (defaults to `main`)
6. Click **Deploy from Git** — CodeBuild clones the repo and runs the same infra/runtime/UI stages as the S3 path

### Auto-deploy on git push

Each seeded repo gets EventBridge rules (`codecommit-push`, `codecommit-pr-merged`) from the `codecommit` Terraform module. When a developer clones a repo, modifies it, and pushes to `main` (or merges a PR), the rule fires Step Functions with that repo+branch and the deployment runs automatically. Trigger branches are configurable in `terraform.tfvars` via `codecommit_trigger_branches`.

### Local customization workflow

```bash
# One-time per developer
git config --global credential.helper '!aws codecommit credential-helper $@'
git config --global credential.UseHttpPath true

# Clone, modify, push
git clone https://git-codecommit.<region>.amazonaws.com/v1/repos/fsi-foundry-<use_case>
cd fsi-foundry-<use_case>
# edit files...
git add .
git commit -m "customize: tweak agent prompt"
git push origin main   # triggers deployment via EventBridge
```

## Building and Deploying Backend Container

After infrastructure is deployed:

1. Get ECR repository URL from Terraform outputs:

```bash
export ECR_REPO=$(terraform output -raw ecr_repository_url)
```

2. Authenticate Docker to ECR:

```bash
# ECR lives in the CONTROL-PLANE region (tier 1), not the governed-fleet region.
aws ecr get-login-password --region "${AWS_REGION:-us-east-1}" | docker login --username AWS --password-stdin $ECR_REPO
```

3. Build and push Docker image:

```bash
cd ../backend
docker build -t control-plane-backend .
docker tag control-plane-backend:latest $ECR_REPO:latest
docker push $ECR_REPO:latest
```

4. Update ECS service to use the new image (automatic if using `latest` tag).

## Deploying Frontend

After infrastructure is deployed:

1. Get S3 bucket and CloudFront distribution ID:

```bash
export FRONTEND_BUCKET=$(terraform output -raw frontend_bucket_name)
export CLOUDFRONT_ID=$(terraform output -raw cloudfront_distribution_id)
```

2. Build frontend:

```bash
cd ../frontend
npm install
npm run build
```

3. Deploy to S3:

```bash
aws s3 sync dist/ s3://$FRONTEND_BUCKET/
```

4. Invalidate CloudFront cache:

```bash
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*"
```

## Module Structure

```
infrastructure/
├── main.tf                   # Main orchestration
├── variables.tf              # Input variables
├── outputs.tf                # Output values
├── providers.tf              # Provider configuration
├── .env.example              # Environment variables template
├── terraform.tfvars.example  # Terraform variables template
├── scripts/                  # Deployment and seeding shell scripts
│   ├── deploy-full.sh        # One-command full deployment (infra + backend image + frontend + Cognito users)
│   ├── destroy.sh            # Tear down all resources
│   ├── import-existing.sh    # Import pre-existing AWS resources into Terraform state
│   ├── seed-codecommit.sh    # Shell wrapper around the Python seeder
│   └── seed-codecommit-templates.py  # Creates one CodeCommit repo per FSI Foundry use case + ref impl
└── modules/
    ├── networking/           # VPC, subnets, security groups
    ├── dynamodb/             # DynamoDB tables
    ├── s3/                   # S3 buckets (project archives + frontend)
    ├── ecr/                  # ECR repository (backend image)
    ├── ecs/                  # ECS cluster, service, tasks (backend API)
    ├── api_gateway/          # API Gateway with VPC Link
    ├── step_functions/       # Source-agnostic deployment orchestrator
    ├── codebuild/            # Dual-source buildspec (Git clone OR S3 unzip)
    ├── codecommit/           # Pre-seeded use case repos + EventBridge trigger rules
    ├── eventbridge/          # Deployment lifecycle events with DLQ
    ├── state_backend/        # Terraform remote state (S3 + DynamoDB)
    ├── cognito/              # Cognito user pool and identity pool
    ├── cloudfront/           # CloudFront distribution (control plane frontend)
    └── observability/        # CloudWatch dashboards and alarms
```

For detailed usage of each script in `scripts/` — modes, environment variables, when to run which — see [scripts/README.md](scripts/README.md).

## Important Outputs

After deployment, Terraform outputs key information:

```bash
# Get all outputs
terraform output

# Get specific outputs
terraform output api_endpoint
terraform output frontend_url
terraform output cognito_user_pool_id
terraform output ecr_repository_url
```

## Cleanup

To destroy all infrastructure:

```bash
terraform destroy
```

**Warning**: This will delete all resources including data in DynamoDB and S3.

## Cost Considerations

This infrastructure uses the following AWS services that incur costs:

- **ECS Fargate**: Pay per vCPU and memory per hour
- **API Gateway**: Pay per request
- **CloudFront**: Pay per data transfer
- **DynamoDB**: On-demand billing
- **S3**: Pay per GB stored and data transfer
- **Step Functions**: Pay per state transition
- **CloudWatch**: Logs and metrics storage

Estimated monthly cost for dev environment: $50-100 (with minimal traffic)

## Troubleshooting

### ECS Tasks Not Starting

Check CloudWatch logs:

```bash
aws logs tail /ecs/ava-control-plane-dev --follow
```

### API Gateway 502 Errors

Check:
1. ECS service is running
2. Target group health checks are passing
3. VPC Link is active

### CloudFront Not Serving Updated Content

Invalidate cache:

```bash
aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
```

## Remote State Management

No state file exists in this tree today — see [Known state and coverage caveats](#known-state-and-coverage-caveats)
before assuming a `plan` reflects what is actually deployed.

For production, enable remote state:

1. Uncomment the backend configuration in `main.tf`:

```hcl
backend "s3" {
  bucket         = "ava-terraform-state"
  key            = "control-plane/terraform.tfstate"
  region         = "us-east-1"
  encrypt        = true
  dynamodb_table = "terraform-state-lock"
}
```

2. Create the S3 bucket and DynamoDB table:

```bash
aws s3api create-bucket --bucket ava-terraform-state --region us-east-1
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

3. Re-initialize Terraform:

```bash
terraform init -migrate-state
```

## Security Notes

- All S3 buckets have public access blocked
- ECS tasks run in private subnets
- API Gateway uses VPC Link for private integration
- DynamoDB tables use encryption at rest
- CloudWatch logs are retained for 7 days
- Cognito enforces strong password policy

Not yet in place: deletion protection is off on every `environments/dev` DynamoDB table,
and point-in-time recovery — though now *declared* on the compliance and operations
tables — is not yet in effect on the live ones, because they exist in no state file. See
[Known state and coverage caveats](#known-state-and-coverage-caveats).

## Support

For issues or questions:
- Check CloudWatch dashboards for metrics
- Review CloudWatch logs for errors