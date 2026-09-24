# Control Plane Dev Environment (LiteLLM Gateway + Control Plane)

Self-contained Terraform root that creates a VPC, an ECS cluster, the full LiteLLM
gateway stack, the control-plane backend and frontend Fargate services, and the 11
control-plane DynamoDB tables — from scratch, in one root.

## Prerequisites

- Terraform >= 1.5
- AWS CLI configured with profile `<your-profile>` (us-east-2)
- Valid AWS credentials: `aws sts get-caller-identity --profile <your-profile>`

## Deploy

```bash
cd platform/control_plane/infrastructure/environments/dev

terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

Expected duration: ~10-15 minutes (RDS and ElastiCache take the longest).

> **`terraform apply` has never been run from this tree.** `backend.tf` declares
> `backend "local"` and **no `terraform.tfstate` file exists**, so the resources that
> do exist in AWS — including the two new Govern tables — are tracked in no state.
> A first `apply` would try to create rather than adopt them; they need
> `terraform import` first. What has been verified here is only:
>
> ```bash
> terraform init -backend=false
> terraform fmt -check
> terraform validate
> ```

## What gets created

| Resource | Details |
|----------|---------|
| VPC | 10.0.0.0/16 with DNS hostnames enabled |
| Public subnets | 10.0.1.0/24 (az-a), 10.0.2.0/24 (az-b) |
| Private subnets | 10.0.10.0/24 (az-a), 10.0.11.0/24 (az-b) |
| Internet Gateway | Routes public subnet traffic to the internet |
| NAT Gateway | Single NAT in public-a for private subnet egress |
| ECS Cluster | `ava-litellm-test` with Container Insights |
| LiteLLM Module | ALB, ECS service, RDS, Redis, S3, Secrets Manager, CloudWatch |
| Control-plane ECS services | Backend (internal ALB, health check `/ping`) and frontend (public ALB, IP-restricted) Fargate services from prebuilt ECR images |
| DynamoDB | 11 control-plane tables — see [DynamoDB tables](#dynamodb-tables) |

### DynamoDB tables

All 11 are declared in `main.tf`, all `PAY_PER_REQUEST`, all with the same key
schema: `hash_key = "pk"` (String), `range_key = "sk"` (String). No local or global
secondary indexes, no TTL.

| Table | Backend settings key | Holds |
|-------|----------------------|-------|
| `fsi-control-plane-deployments` | `DEPLOYMENTS_TABLE_NAME` | Deployment records |
| `fsi-control-plane-guardrails` | `GUARDRAILS_TABLE_NAME` | Guardrail templates and status |
| `fsi-control-plane-finops-spend` | `FINOPS_SPEND_TABLE_NAME` | Per-use-case/model spend written by the spend aggregator from LiteLLM usage |
| `fsi-control-plane-govern-audit` | `GOVERN_AUDIT_TABLE_NAME` | Append-only audit/decision log |
| `fsi-control-plane-govern-conformance` | `GOVERN_CONFORMANCE_TABLE_NAME` | ISO/IEC 42001 AIMS clause controls |
| `fsi-control-plane-govern-graduation` | `GOVERN_GRADUATION_TABLE_NAME` | Progressive-autonomy graduation records |
| `fsi-control-plane-govern-sr26` | `GOVERN_SR26_TABLE_NAME` | SR 26-2 model-risk control mappings |
| `fsi-control-plane-govern-enforcement` | `GOVERN_ENFORCEMENT_TABLE_NAME` | Runtime enforcement decisions and policies |
| `fsi-control-plane-govern-a2a-trust` | `GOVERN_A2A_TRUST_TABLE_NAME` | A2A trust policies and agent identities |
| `fsi-control-plane-govern-compliance` | `GOVERN_COMPLIANCE_TABLE_NAME` | Control attestations and evidence. `pk = COMPLIANCE#<framework_id>` or `EVIDENCE#<framework_id>#<control_id>`, `sk = control_id` |
| `fsi-control-plane-govern-operations` | `GOVERN_OPERATIONS_TABLE_NAME` | Operations Hub records: incidents, alerts, SLAs, change events |

The last two are new. Before them, the backend referenced `ava-govern-compliance`
and `ava-operations-incidents` — neither of which was declared here or existed in
any region, so writes fell back to process memory and were lost on restart. Neither
old name is aliased; nothing was ever stored under them, so there is nothing to
migrate. The comments beside those two resources in `main.tf` still name the old
tables **on purpose**, as historical notes.

**Home region is resolved, not assumed.** This root's provider region is
`var.aws_region` (default `us-east-2`), but the backend resolves each table's home
region independently via `region_config.table_region()` in
`backend/src/core/region_config.py`, most-specific-first:

```
<TABLE_KEY>_TABLE_REGION  →  CONTROL_PLANE_TABLE_REGION  →  AWS_REGION
```

`<TABLE_KEY>` is the settings prefix before `_TABLE_NAME`, so
`GOVERN_COMPLIANCE_TABLE_REGION` moves just that one table. Resolution is configured,
never discovered — a control-plane table is read-write, so picking a region by probing
for a matching name would be a split-brain write target. Do not confuse `AWS_REGION`
(these tables, `us-east-2` in the demo account) with `GOVERN_AWS_REGION` (the governed
Bedrock/AgentCore fleet, `us-east-1`): an AWS call against the wrong region succeeds
and returns that region's smaller or empty inventory rather than raising, so the
mistake surfaces as an undercount under a Live badge, not as an error.

The backend task definition now declares all five region and table settings that the
deployed container previously left to `config.py` defaults, so the ECS backend and
`docker-compose.yaml` no longer disagree about where anything lives:

- `AWS_REGION = var.aws_region`, not the `"us-east-2"` literal it used to be. This
  root's provider region *is* `var.aws_region`, so binding the two makes it impossible
  for the region the backend reads from to drift from the region the tables were
  created in. With the literal, `-var aws_region=us-west-2` would have provisioned all
  11 tables in us-west-2 while still pointing the backend at us-east-2, where every
  Scan returns an empty list and no error.
- `GOVERN_AWS_REGION = "us-east-1"` — deliberately still a literal, because it is a
  fact about the customer's AI estate rather than about where this root deploys, and so
  must not follow `var.aws_region`. It is declared even though `config.py` already
  defaults to the same value: a default that happens to be right is the condition that
  hid this bug class in the first place, and it stops being right the moment
  `AWS_REGION` moves.
- `GUARDRAILS_TABLE_REGION = "us-east-1"`, because `fsi-control-plane-guardrails` is
  declared in this us-east-2 root while the real table lives in us-east-1. Without it,
  `table_region("GUARDRAILS")` falls through to `AWS_REGION` and every guardrail read
  returns an empty table with no error.
- `GOVERN_OPERATIONS_TABLE_NAME` and `GOVERN_COMPLIANCE_TABLE_NAME`, matching every
  other table above. The names these replace (`ava-operations-incidents`,
  `ava-govern-compliance`) existed in no region, which is why a silent fallback to a
  default is not a safe way to address an attestation store.

The `fsi-control-plane-guardrails` declaration itself still diverges from where the
table actually is: it is created by this us-east-2 root, and both the task definition
and `docker-compose.yaml` then override its read region to us-east-1. Pinning the
readers is a correct workaround, not a fix — moving the declaration into a us-east-1
provider alias is the open item.

**PITR: on for 2 of 11, off for the other 9. Deletion protection: off for all 11.**
`fsi-control-plane-govern-compliance` and `fsi-control-plane-govern-operations` declare
`point_in_time_recovery { enabled = true }`, because their contents cannot be
regenerated: the compliance table holds control attestations and evidence (the audit
record a regulator would ask for), and the operations table holds incident records
entered by hand rather than discovered from AWS. The other nine declare nothing and so
sit at the AWS default of off — that is the documented demo posture (see "Hardening
required before production" in the root `SECURITY.md`).

`deletion_protection_enabled` is deliberately left unset on all 11, so `terraform
destroy` still works for the dev teardown documented below. Turn it on before this stack
backs anything audited.

> **The PITR declaration is not yet in effect on the two Govern tables.** They were
> created outside Terraform and appear in no state file (there is none), so nothing has
> reconciled the declaration against the live tables. Enabling it for real needs
> `terraform import` followed by an apply, or a one-off
> `aws dynamodb update-continuous-backups`. Until then, treat the live tables as PITR-off
> regardless of what this root declares.

## Outputs

After apply, retrieve key values:

```bash
terraform output gateway_endpoint
terraform output config_s3_bucket
terraform output master_key_secret_arn
terraform output -json backend_environment_variables
```

## Verify Health

The gateway endpoint is an internal ALB — run health checks from inside the VPC:

```bash
# Via SSM session or ECS Exec
curl -s http://<gateway_endpoint>/health | python3 -m json.tool
```

For the control-plane backend, the ALB target group probes `/ping`. Note that
`/api/v1/health` does **not** exist and returns 404: `main.py` includes
`health_router` with no `settings.API_PREFIX`, so `/health` and `/ping` are served at
the root only. For a readiness probe that actually exercises the Govern data path,
use:

```bash
curl -s http://<backend_alb>/api/v1/govern/compliance/posture
```

## Tear Down

```bash
terraform destroy
```

Deletion protection is off throughout dev for easy cleanup, but by two different
routes. Explicit: the LiteLLM RDS instance
(`modules/litellm/rds.tf`, `deletion_protection = var.environment == "prod"`, so false
here) and the LiteLLM ALB (`modules/litellm/alb.tf`,
`enable_deletion_protection = false`). By omission: this root's own ALBs and all 11
DynamoDB tables in `main.tf` declare nothing, leaving the AWS default of off.

## Notes

- Uses local backend (no remote state), and no `terraform.tfstate` file is present —
  see the warning under [Deploy](#deploy)
- Single NAT gateway to save cost — not HA, acceptable for dev
- CloudFront/WAF disabled by default (enable_cloudfront = false)
- Spend Aggregator Lambda layers left empty (schedule disabled in dev)
