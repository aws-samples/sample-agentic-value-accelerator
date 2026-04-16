# Observability Stack (Foundation)

Foundation template providing Langfuse v3 observability for agent tracing, monitoring, prompt management, and evaluation. Deploy once, connect all agent use cases.

## Architecture

```
Agent Use Cases ──► Langfuse SDK (v4) ──► ALB / Ingress
                                              ↓
                                     ┌─── Langfuse Web ───┐
                                     │   (port 3000)       │
                                     └────────┬────────────┘
                                              │
                              ┌───────────────┼───────────────┐
                              ↓               ↓               ↓
                        PostgreSQL       ClickHouse        Redis/Valkey
                        (metadata)       (traces/spans)    (cache/queue)
                              │               │               │
                              └───────────────┼───────────────┘
                                              │
                                     ┌────────┴────────┐
                                     │ Langfuse Worker  │
                                     │ (async processing)│
                                     └─────────────────┘
                                              │
                                              ↓
                                        S3 (events,
                                        exports, media)
```

## Deployment Options

Choose one of three deployment patterns based on your operational preferences:

### 1. ECS Fargate (`terraform_ecs/`)

ECS Fargate with fully managed AWS data stores. **Recommended for most teams.**

| Component   | Service                          |
|-------------|----------------------------------|
| Compute     | ECS Fargate                      |
| PostgreSQL  | Aurora Serverless v2             |
| Redis       | ElastiCache Valkey               |
| ClickHouse  | ECS Fargate + EFS                |
| Storage     | S3                               |

**Best for:** Simplicity, minimal ops overhead, auto-scaling databases.

### 2. EKS with Managed Data Stores (`terraform_eks/`)

Langfuse runs on EKS (Fargate) while data stores remain AWS-managed.

| Component   | Service                          |
|-------------|----------------------------------|
| Compute     | EKS Fargate                      |
| PostgreSQL  | Aurora Serverless v2             |
| Redis       | ElastiCache                      |
| ClickHouse  | EKS pod + EFS                    |
| Storage     | S3                               |

**Best for:** Teams already using Kubernetes who want managed data stores.

### 3. EKS All Pods (`terraform_eks_pods/`)

Everything runs as Kubernetes pods with gp3 EBS persistent volumes on a managed EC2 node group.

| Component   | Service                          |
|-------------|----------------------------------|
| Compute     | EKS (EC2 managed node group)     |
| PostgreSQL  | Pod (gp3 EBS)                    |
| Redis       | Pod (gp3 EBS)                    |
| ClickHouse  | Pod (gp3 EBS)                    |
| Storage     | MinIO pod (gp3 EBS)             |

**Best for:** Full control, cost optimization, portable infrastructure.

## Prerequisites

- Terraform >= 1.0
- Docker (for ECS pattern — images are pulled, tagged, and pushed to ECR automatically via Terraform)
- `kubectl` (for EKS patterns)

## Quick Start

### Step 1: Deploy the networking stack

The `networking-base` template creates a VPC with public/private subnets, internet gateway, and NAT gateway. It also generates `network.auto.tfvars.json` files in each observability-stack Terraform directory, so network variables (`vpc_id`, `vpc_cidr`, `private_subnet_ids`, `public_subnet_ids`) are injected automatically.

```bash
cd ../networking-base/iac/terraform
terraform init
terraform apply
```

### Step 2: Deploy Langfuse

After the networking stack completes, deploy any of the 3 patterns. Network variables are auto-loaded from `network.auto.tfvars.json`. All other variables have sensible defaults, so you can deploy with no flags. To customize, either create a `terraform.tfvars` file or pass `-var` flags.

#### ECS Fargate

```bash
cd iac/terraform_ecs
terraform init
terraform apply
```

Terraform automatically creates ECR repositories, pulls container images, and pushes them to ECR. Access Langfuse at the `langfuse_host` output URL after 2-3 minutes (initial DB migrations).

Default login: `admin@langfuse.local` / `Password123!`. Override via `terraform.tfvars`:

```hcl
project_name             = "my-langfuse"
langfuse_init_user_email = "me@example.com"
langfuse_init_user_name  = "myname"
langfuse_init_user_password = "MySecurePass123!"
```

#### EKS with Managed Data Stores

```bash
cd iac/terraform_eks
terraform init
terraform apply
```

#### EKS All Pods

```bash
cd iac/terraform_eks_pods
terraform init
terraform apply
```

For EKS patterns, leave `enable_https=false` (the default) for HTTP-only testing without an ACM certificate. Set `enable_https=true` when you have a valid ACM certificate for your domain.

## Configuration

### Network Variables (auto-injected by networking-base)

These are written to `network.auto.tfvars.json` in each Terraform directory and loaded automatically. No manual input needed.

| Variable | Description |
|----------|-------------|
| `vpc_id` | VPC ID |
| `vpc_cidr` | VPC CIDR block |
| `private_subnet_ids` | Private subnet IDs (compute, databases) |
| `public_subnet_ids` | Public subnet IDs (ALB) |

### All Variables (all have defaults — no flags required)

| Variable | Description | Default | Patterns |
|----------|-------------|---------|----------|
| `project_name` | Project name for resource tagging | `langfuse` | ECS |
| `name` | Name prefix for resources | `langfuse` | EKS, EKS Pods |
| `domain` | Domain for NEXTAUTH_URL / bucket naming | same as `name` | EKS, EKS Pods |
| `environment` | Deployment environment | `dev` | All |
| `enable_https` | Enable HTTPS on ALB (requires ACM cert) | `false` | EKS |
| `langfuse_init_user_email` | Email for the initial admin user | `admin@langfuse.local` | ECS |
| `langfuse_init_user_name` | Display name for the initial admin user | `admin` | ECS |
| `langfuse_init_user_password` | Password for the initial admin user | `password123` | ECS |
| `langfuse_init_org_name` | Name of the initial organization | `Default Org` | ECS |
| `langfuse_cpu` | CPU for Langfuse (`2048` units or `"2"`) | `2048`/`"2"` | All |
| `langfuse_memory` | Memory for Langfuse (`4096` MB or `"4Gi"`) | `4096`/`"4Gi"` | All |
| `langfuse_desired_count` | Number of Langfuse tasks | `2` | ECS |
| `langfuse_web_replicas` | Number of Langfuse web replicas | `1` | EKS |
| `clickhouse_cpu` | CPU for ClickHouse | `2048`/`"2"` | All |
| `clickhouse_memory` | Memory for ClickHouse | `8192`/`"8Gi"` | All |
| `postgres_min_capacity` | Aurora min ACU | `0.5` | ECS, EKS |
| `postgres_max_capacity` | Aurora max ACU | `2.0` | ECS, EKS |
| `postgres_version` | Aurora PostgreSQL version | `15.12` | ECS, EKS |
| `node_instance_type` | EC2 instance type for node group | `m5.xlarge` | EKS Pods |
| `node_desired_size` | Desired number of EC2 nodes | `4` | EKS Pods |
| `alb_scheme` | ALB scheme | `internet-facing` | All |
| `enable_execute_command` | Enable ECS Exec for debugging | `false` | ECS |

## Outputs

All patterns output `langfuse_host` with a full, working URL.

| Output | Description | Patterns |
|--------|-------------|----------|
| `langfuse_host` | Langfuse URL (e.g., `http://<alb-dns>`) | All |
| `langfuse_alb_dns` | ALB DNS name | EKS |
| `langfuse_secret_name` | Secrets Manager secret with API keys | ECS |
| `cluster_name` | ECS or EKS cluster name | All |
| `load_balancer_dns_name` | ALB DNS name | ECS |
| `postgres_endpoint` | PostgreSQL cluster endpoint | ECS, EKS |
| `redis_endpoint` | Redis cluster endpoint | ECS, EKS |
| `minio_endpoint` | In-cluster MinIO S3 endpoint | EKS Pods |

## Connecting Agents to Langfuse

See [CONNECTIVITY.md](CONNECTIVITY.md) for detailed instructions on connecting your agents to Langfuse, including:

- **AgentCore Runtime agents** — via the Control Plane API or environment variables
- **Direct SDK integration** — LangGraph, Strands, and generic Python agents
- **OpenTelemetry (OTEL)** — for any OTEL-compatible framework or language

### Testing the Deployment

Two test scripts are included to validate deployments and create sample traces.

#### ECS Testing

ECS deployments auto-seed API keys into Secrets Manager. Retrieve them and run:

```bash
# Get keys from Secrets Manager
SECRET=$(aws secretsmanager get-secret-value --secret-id langfuse-secrets \
  --query SecretString --output text)
PK=$(echo "$SECRET" | python3 -c "import sys,json; print(json.load(sys.stdin)['langfuse_public_key'])")
SK=$(echo "$SECRET" | python3 -c "import sys,json; print(json.load(sys.stdin)['langfuse_secret_key'])")
HOST=$(cd iac/terraform_ecs && terraform output -raw langfuse_host)

python3 scripts/test-langfuse.py --host "$HOST" --public-key "$PK" --secret-key "$SK"
```

#### EKS Testing

EKS deployments require API keys to be seeded into the database. The `test-langfuse-eks.sh` script handles this automatically — it seeds a project and API keys via Prisma in the web pod, then runs the full test suite.

```bash
# Auto-detect host, cluster, and region from terraform output
./scripts/test-langfuse-eks.sh

# Override specific values
./scripts/test-langfuse-eks.sh --host http://<ALB_DNS> --region us-west-2

# Skip seeding if keys were already created (e.g., via the Langfuse UI)
./scripts/test-langfuse-eks.sh --skip-seed
```

**Options:**

| Flag | Description |
|------|-------------|
| `--host URL` | Langfuse ALB URL (auto-detected from Terraform output if omitted) |
| `--region REGION` | AWS region (auto-detected if omitted) |
| `--cluster NAME` | EKS cluster name (default: `langfuse`) |
| `--skip-seed` | Skip API key seeding — use when keys already exist |

**What it does:**

1. Reads the Langfuse host and cluster name from Terraform output
2. Updates kubeconfig for the EKS cluster
3. Waits for the web pod to be ready
4. Waits for the health endpoint to respond
5. Seeds a project, organization, and API keys in the database via the web pod
6. Runs the full 7-test suite (`test-langfuse.py`)

#### Generic Testing (Any Pattern)

If you already have API keys (from the UI or Secrets Manager), run the test suite directly:

```bash
python3 scripts/test-langfuse.py \
  --host http://<ALB_DNS> \
  --public-key pk-lf-xxx \
  --secret-key sk-lf-xxx
```

#### Test Suite Coverage

| Test | What it validates |
|------|-------------------|
| Health check | `/api/public/health` returns `200` with `status: OK` |
| API authentication | Basic auth with API keys succeeds |
| OTEL endpoint | `/api/public/otel/v1/traces` endpoint is reachable |
| SDK auth + trace + generation + score | Creates a trace with a nested generation and score via the Langfuse SDK |
| SDK @observe decorator | Validates the `@observe()` decorator-based tracing |
| Dataset creation | Creates a dataset with a dataset item |
| API trace query | Queries `/api/public/traces` and verifies traces are persisted |

**Prerequisites:** `pip install requests langfuse`

## Sizing Guide

| Environment | Langfuse CPU/Mem | ClickHouse CPU/Mem | Aurora ACU | Redis |
|-------------|-----------------|-------------------|------------|-------|
| Dev         | 1024 / 2048 MB  | 1024 / 4096 MB    | 0.5 - 2    | cache.t4g.small |
| Staging     | 2048 / 4096 MB  | 2048 / 8192 MB    | 1 - 4      | cache.t4g.medium |
| Production  | 4096 / 8192 MB  | 4096 / 16384 MB   | 2 - 16     | cache.r7g.large |

## Troubleshooting

### ECS: Tasks stuck in PENDING
- Verify NAT gateway is active (check for blackhole routes)
- Ensure ECR images exist and are amd64 architecture
- Check Secrets Manager connectivity from private subnets

### ECS: Health checks failing (503)
- Langfuse runs DB migrations on first boot — allow 2-3 minutes
- Check CloudWatch logs: `/aws/ecs/<name>/langfuse`
- Verify ClickHouse is healthy via Service Discovery

### EKS: CoreDNS pods stuck in Pending
- On Fargate-only clusters, CoreDNS needs a restart after Fargate profiles are created. The Terraform modules handle this automatically via `null_resource.coredns_restart`.
- If deploying manually, run: `kubectl rollout restart deployment coredns -n kube-system`

### EKS: ALB ingress has no ADDRESS
- Public subnets must be tagged with `kubernetes.io/role/elb=1`. The Terraform modules handle this automatically via `aws_ec2_tag` resources.
- If `enable_https=true` and you lack an ACM certificate, the ALB controller will fail with "no certificate found for host". Set `enable_https=false` for HTTP-only testing.
- Restart the ALB controller if it started before CoreDNS: `kubectl rollout restart deployment aws-load-balancer-controller -n kube-system`

### EKS Pods: Pods stuck in Pending (Insufficient CPU/memory)
- The EKS All Pods pattern uses a managed EC2 node group. If pods can't schedule, increase `node_desired_size` or use a larger `node_instance_type`.
- Fargate does not support EBS volumes — all stateful workloads in this pattern run on EC2 nodes.

### EKS: Langfuse pods in CrashLoopBackOff
- Usually caused by database connectivity issues. Verify CoreDNS is running (`kubectl get pods -n kube-system`).
- Check pod logs: `kubectl logs -n langfuse <pod-name>`
- ClickHouse may not be ready yet — the web pod will recover automatically once ClickHouse is up.

### Empty traces in UI
- Set `output` on parent spans, not just child observations
- Call `langfuse.flush()` before process exits
- Verify API keys match the seed project configuration

## License

See LICENSE file in repository root.
