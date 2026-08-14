# AVA AgentCore Deployment Guide

> **Source**: `aws-samples/sample-agentic-value-accelerator` (FSI Foundry)  
> **Last Analyzed**: 2025-06-26  
> **Purpose**: Complete reference for deploying agents to Amazon Bedrock AgentCore via the AVA platform

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Dockerfile — Exact Content & Line-by-Line](#dockerfile)
3. [Docker Build — ARM64, buildx, Naming Convention](#docker-build)
4. [ECR Push Flow](#ecr-push-flow)
5. [IAM Role — Trust Policy & Permissions](#iam-role)
6. [CloudFormation Template — Full YAML](#cloudformation-template)
7. [Terraform Orchestration — Module Hierarchy](#terraform-orchestration)
8. [Runtime Terraform — Image Digest & CFN Stack](#runtime-terraform)
9. [Environment Variables](#environment-variables)
10. [Health Check Mechanism](#health-check)
11. [Image Tagging Strategy](#image-tagging)
12. [Full Deploy Sequence — Numbered Steps](#full-deploy-sequence)
13. [Application Entry Point — main.py](#entry-point)
14. [AgentCore Adapter — Protocol Translation](#agentcore-adapter)
15. [Adapters Directory](#adapters)
16. [Full Deploy vs App-Only Deploy](#full-vs-app-only)
17. [Common Failure Modes](#failure-modes)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    AVA Deployment Pipeline                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Terraform (infra/)     2. Docker Build        3. Terraform   │
│  ┌──────────────────┐    ┌──────────────────┐   (runtime/)      │
│  │ • S3 Bucket       │    │ • ARM64 buildx   │   ┌────────────┐ │
│  │ • ECR Repository  │    │ • Push to ECR    │   │ CFN Stack   │ │
│  │ • IAM Role        │    │ • Get digest     │   │ (AgentCore  │ │
│  │ • Shared module   │    │                  │   │  Runtime)   │ │
│  └──────────────────┘    └──────────────────┘   └────────────┘ │
│                                                                   │
│  AWS::BedrockAgentCore::Runtime                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Container: {ECR_REPO}:{TAG}@{DIGEST}                      │   │
│  │ Network: PUBLIC                                            │   │
│  │ Port: 8080                                                 │   │
│  │ Health: GET /health                                        │   │
│  │ CMD: opentelemetry-instrument python -m main               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Dockerfile

**Path**: `applications/fsi_foundry/foundations/docker/Dockerfile.agentcore`

```dockerfile
# AgentCore Dockerfile for control plane pipeline deployments
# Adapted from foundations/docker/patterns/agentcore.Dockerfile
# Uses zip-relative paths instead of repo-root paths

ARG USE_CASE_ID=fraud_detection
ARG FRAMEWORK=strands

FROM public.ecr.aws/docker/library/python:3.11-slim AS base
ARG USE_CASE_ID
ARG FRAMEWORK
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY app_src/requirements/requirements.txt ./requirements/
COPY app_src/requirements/requirements_agentcore.txt ./requirements/
COPY app_src/requirements/requirements_strands.txt ./requirements/

RUN pip install --no-cache-dir -r requirements/requirements.txt && \
    pip install --no-cache-dir -r requirements/requirements_agentcore.txt && \
    pip install --no-cache-dir aws-opentelemetry-distro>=0.10.1

RUN if [ "$FRAMEWORK" = "strands" ]; then \
        pip install --no-cache-dir -r requirements/requirements_strands.txt; \
    fi

COPY app_src/ .
RUN mkdir -p use_cases
COPY use_cases/${USE_CASE_ID}/src/${FRAMEWORK}/ ./use_cases/${USE_CASE_ID}/
RUN echo '"""AVA Use Cases."""' > use_cases/__init__.py

ENV DEPLOYMENT_MODE=agentcore USE_CASE_ID=${USE_CASE_ID} FRAMEWORK=${FRAMEWORK}
RUN useradd -m -u 1000 appuser
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1
# When ENABLE_TRACING=true and OTEL_PYTHON_DISTRO is set (we set both via the
# control plane → runtime.tf path when AgentCore observability is enabled),
# `opentelemetry-instrument` wraps the process and auto-instruments all
# supported libraries (boto3, requests, langchain, etc) without code changes.
# When ENABLE_TRACING=false, the wrapper is still used but emits nothing —
# negligible overhead, no behavior change.
CMD ["opentelemetry-instrument", "python", "-m", "main"]
```

### Why Each Line Matters

| Line | Purpose |
|------|---------|
| `ARG USE_CASE_ID=fraud_detection` | Build-time variable — selects which use case code to embed |
| `ARG FRAMEWORK=strands` | Build-time variable — selects framework-specific dependencies |
| `FROM public.ecr.aws/docker/library/python:3.11-slim` | **Public ECR** base image (no Docker Hub rate limits). Python 3.11 slim for small image size |
| `WORKDIR /app` | Standard working directory |
| `apt-get install curl` | **Required for health checks** — the HEALTHCHECK command uses curl |
| `COPY requirements...` | Layer caching — requirements change less often than source code |
| `pip install aws-opentelemetry-distro>=0.10.1` | **ADOT** (AWS Distro for OpenTelemetry) for auto-instrumentation |
| `RUN if [ "$FRAMEWORK" = "strands" ]` | Conditional deps — only install strands SDK if framework is strands |
| `COPY app_src/ .` | Platform foundation code (adapters, config, utils) |
| `COPY use_cases/${USE_CASE_ID}/src/${FRAMEWORK}/` | **Use-case-specific agent code** for the selected framework |
| `ENV DEPLOYMENT_MODE=agentcore` | Tells main.py to use the AgentCore adapter (not FastAPI/Lambda) |
| `useradd -m -u 1000 appuser` / `USER appuser` | **Security** — never run as root |
| `EXPOSE 8080` | AgentCore expects the container to listen on **port 8080** |
| `HEALTHCHECK` | Docker-level health check (also used by AgentCore's built-in probing) |
| `CMD ["opentelemetry-instrument", "python", "-m", "main"]` | Entry point wraps python with OTEL auto-instrumentation |

### Key Facts
- **Architecture**: ARM64 required (AgentCore runs Graviton instances)
- **Port**: 8080 (not 8000 like FastAPI/EC2 mode)
- **Health endpoint**: `GET /health` on port 8080
- **Non-root**: UID 1000 (`appuser`)
- **No entrypoint script** — CMD is the only execution path

---

## Docker Build

**Path**: `applications/fsi_foundry/scripts/lib/docker.sh`

### Image Naming Convention

```
ava-{USE_CASE_ID}-{FRAMEWORK_SHORT}-{DEPLOYMENT_PATTERN}:{TAG}
```

**Examples**:
```
ava-kyc-langgraph-agentcore:latest
ava-fraud-strands-agentcore:v1.0.0
ava-claims-langgraph-ec2:dev
```

### Framework Short Name Mapping

| Framework ID | Short Name |
|---|---|
| `langchain_langgraph` | `langgraph` |
| `strands` | `strands` |
| `crewai` | `crewai` |
| `llamaindex` | `llamaindex` |

### Build Command (AgentCore = ARM64)

```bash
docker buildx build \
  --platform linux/arm64 \
  --build-arg USE_CASE_ID=kyc \
  --build-arg FRAMEWORK=strands \
  -f foundations/docker/Dockerfile.agentcore \
  -t ava-kyc-strands-agentcore:latest \
  --load .
```

**Critical flags**:
- `--platform linux/arm64` — **MANDATORY** for AgentCore. AMD64 builds will fail at runtime
- `--load` — loads into local Docker daemon (vs `--push` for remote)
- `buildx build` — required for cross-platform builds on non-ARM hosts

### For ECR Push (with digest capture):

```bash
docker buildx build \
  --platform linux/arm64 \
  --build-arg USE_CASE_ID=${USE_CASE_ID} \
  --build-arg FRAMEWORK=${FRAMEWORK} \
  -f foundations/docker/Dockerfile.agentcore \
  -t ${ECR_REPO_URI}:${TAG} \
  --push .
```

---

## ECR Push Flow

The deploy scripts handle ECR authentication and push:

```bash
# 1. Get ECR login token
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# 2. Build and push (buildx handles both in one command)
docker buildx build \
  --platform linux/arm64 \
  --build-arg USE_CASE_ID=${USE_CASE_ID} \
  --build-arg FRAMEWORK=${FRAMEWORK} \
  -f ${DOCKERFILE_PATH} \
  -t ${ECR_REPO_URI}:${TAG} \
  --push .

# 3. Capture the image digest for immutable deployment
IMAGE_DIGEST=$(aws ecr describe-images \
  --repository-name ${ECR_REPO_NAME} \
  --image-ids imageTag=${TAG} \
  --query 'imageDetails[0].imageDigest' \
  --output text)

# 4. Final image reference passed to Terraform:
# ${ECR_REPO_URI}:${TAG}@${IMAGE_DIGEST}
```

---

## IAM Role

**Path**: `applications/fsi_foundry/foundations/iac/agentcore/infra/iam.tf`

### Trust Policy (AssumeRolePolicy)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "bedrock-agentcore.amazonaws.com"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "aws:SourceAccount": "<ACCOUNT_ID>"
        }
      }
    }
  ]
}
```

> **Key**: The service principal is `bedrock-agentcore.amazonaws.com`. The `aws:SourceAccount` condition prevents confused deputy attacks.

### Role Name Pattern
```
AgentCoreRuntime-{project_name}-{use_case_short}-{framework_short}-{region_no_dashes}
```

### Attached Policies

The role has **6 policy attachments**:

| Policy | Source | Purpose |
|--------|--------|---------|
| S3 data access | `module.shared.s3_policy_arn` | Read customer data from S3 |
| Bedrock invoke | `module.shared.bedrock_policy_arn` | Call Bedrock models |
| CloudWatch logs | `module.shared.cloudwatch_policy_arn` | Write logs |
| Code access (S3) | Inline | Read deployment packages from S3 bucket |
| X-Ray tracing | Inline | Send traces to X-Ray |
| ECR pull | Inline | Pull container images |
| Secrets Manager | Inline | Read Langfuse API keys |

### ECR Access Policy (Exact)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRAuthorizationToken",
      "Effect": "Allow",
      "Action": ["ecr:GetAuthorizationToken"],
      "Resource": "*"
    },
    {
      "Sid": "ECRRepositoryAccess",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchCheckLayerAvailability"
      ],
      "Resource": "<ECR_REPOSITORY_ARN>"
    }
  ]
}
```

### X-Ray Tracing Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords",
        "xray:GetSamplingRules",
        "xray:GetSamplingTargets"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "<DEPLOYMENT_REGION>"
        }
      }
    }
  ]
}
```

### Secrets Manager Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:<REGION>:<ACCOUNT>:secret:*langfuse*"
    }
  ]
}
```

---

## CloudFormation Template

**Path**: `applications/fsi_foundry/foundations/iac/agentcore/runtime/agentcore_runtime.yaml`

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'AgentCore Runtime for Financial Risk Assessment (Container-based)'

Parameters:
  AgentName:
    Type: String
    Default: financial_risk_assessment
    Description: Name of the AgentCore runtime
  
  RoleArn:
    Type: String
    Description: ARN of the IAM role for AgentCore runtime
  
  ECRRepository:
    Type: String
    Description: ECR repository URI for container image
  
  ImageTag:
    Type: String
    Default: latest
    Description: Container image tag
  
  DataBucket:
    Type: String
    Description: S3 bucket for customer data
  
  BedrockModelId:
    Type: String
    Default: us.anthropic.claude-haiku-4-5-20251001-v1:0
    Description: Bedrock model ID
  
  UseCaseId:
    Type: String
    Description: Use case ID for resource naming (e.g., b01, i03)

  UseCaseName:
    Type: String
    Description: Use case name for application configuration (e.g., kyc_banking)

  Framework:
    Type: String
    Default: langchain_langgraph
    Description: AI agent framework (langchain_langgraph or strands)

  Description:
    Type: String
    Default: AVA AgentCore Runtime
    Description: Description of the AgentCore runtime

  Environment:
    Type: String
    Default: dev
    Description: Environment name

  AwsRegion:
    Type: String
    Default: us-east-1
    Description: AWS region

  EnableTracing:
    Type: String
    Default: 'false'
    Description: Enable Langfuse OTEL tracing

  LangfuseHost:
    Type: String
    Default: ''
    Description: Langfuse server URL

  LangfuseSecretName:
    Type: String
    Default: ''
    Description: Secrets Manager secret name for Langfuse API keys

  GuardrailId:
    Type: String
    Default: ''
    Description: Bedrock Guardrail ID to apply to model invocations

  GuardrailVersion:
    Type: String
    Default: ''
    Description: Bedrock Guardrail version (DRAFT or published version number)


Resources:
  AgentCoreRuntime:
    Type: AWS::BedrockAgentCore::Runtime
    Properties:
      AgentRuntimeName: !Ref AgentName
      Description: !Ref Description
      RoleArn: !Ref RoleArn
      AgentRuntimeArtifact:
        ContainerConfiguration:
          ContainerUri: !Sub '${ECRRepository}:${ImageTag}'
      NetworkConfiguration:
        NetworkMode: PUBLIC
      EnvironmentVariables:
        DEPLOYMENT_MODE: agentcore
        AWS_REGION: !Ref AwsRegion
        AGENT_FRAMEWORK: !Ref Framework
        BEDROCK_MODEL_ID: !Ref BedrockModelId
        S3_BUCKET_NAME: !Ref DataBucket
        APP_ENV: !Ref Environment
        USE_CASE_ID: !Ref UseCaseName
        AGENT_NAME: !Ref UseCaseName
        DATA_PREFIX: !Sub "samples/${UseCaseName}"
        ENABLE_TRACING: !Ref EnableTracing
        LANGFUSE_HOST: !Ref LangfuseHost
        LANGFUSE_SECRET_NAME: !Ref LangfuseSecretName
        GUARDRAIL_ID: !Ref GuardrailId
        GUARDRAIL_VERSION: !Ref GuardrailVersion
        # OTel resource attributes
        OTEL_RESOURCE_ATTRIBUTES: !Sub "usecase=${UseCaseId},agent_name=${AgentName},framework=${Framework},environment=${Environment},service.name=ava-${UseCaseName},agent.name=${AgentName}"
        # ADOT auto-instrumentation config
        OTEL_PYTHON_DISTRO: aws_distro
        OTEL_PYTHON_CONFIGURATOR: aws_configurator
        AGENT_OBSERVABILITY_ENABLED: !Ref EnableTracing
      Tags:
        Name: !Sub '${AgentName}-agentcore_runtime'
        Environment: !Ref Environment

Outputs:
  AgentRuntimeId:
    Description: ID of the AgentCore Runtime
    Value: !GetAtt AgentCoreRuntime.AgentRuntimeId
    Export:
      Name: !Sub '${AWS::StackName}-RuntimeId'
  
  AgentRuntimeArn:
    Description: ARN of the AgentCore Runtime
    Value: !GetAtt AgentCoreRuntime.AgentRuntimeArn
    Export:
      Name: !Sub '${AWS::StackName}-RuntimeArn'
  
  AgentRuntimeName:
    Description: Name of the AgentCore Runtime
    Value: !Ref AgentName
    Export:
      Name: !Sub '${AWS::StackName}-RuntimeName'
```

### Key Observations

1. **Resource Type**: `AWS::BedrockAgentCore::Runtime` (custom CloudFormation resource)
2. **Network Mode**: `PUBLIC` — the runtime has internet access (needed for Bedrock API calls)
3. **Container URI format**: `${ECRRepository}:${ImageTag}` (tag or tag@digest)
4. **No VPC config** — PUBLIC mode doesn't require subnets/security groups
5. **OTel Integration**: Automatically instruments boto3, requests, langchain via ADOT

---

## Terraform Orchestration

### Module Hierarchy

```
iac/agentcore/
├── infra/               ← Step 1: Deploy FIRST
│   ├── main.tf          ← S3 bucket, ECR repo, shared module
│   ├── iam.tf           ← IAM role + policies
│   ├── variables.tf     ← Input variables
│   └── outputs.tf       ← ECR URI, role ARN, bucket name
│
├── runtime/             ← Step 3: Deploy AFTER Docker push
│   ├── main.tf          ← CloudFormation stack deployment
│   ├── agentcore_runtime.yaml  ← CFN template
│   ├── variables.tf     ← Input variables (incl. image_tag)
│   └── outputs.tf       ← Runtime ID, ARN
│
└── shared/              ← Referenced by infra/
    └── (S3, Bedrock, CloudWatch policies)
```

### Infra Module Creates (in order)

1. **Shared infrastructure** (`module "shared"`) — S3 data bucket, IAM policies for Bedrock/S3/CloudWatch
2. **S3 bucket** (`aws_s3_bucket.agentcore_code`) — For deployment packages
   - Name: `agentcore-code-{use_case}-{framework}-{region}-{account_id}`
   - Versioning: Enabled
   - Encryption: AES256
   - Public access: Blocked
3. **ECR repository** (`aws_ecr_repository.agentcore`)
   - Name: `{project}-{use_case}-{framework}-agentcore-{region}`
   - Tag mutability: MUTABLE
   - Scan on push: true
   - Lifecycle: Keep last 5 images
4. **IAM role** (`aws_iam_role.agentcore_runtime`) — with all policy attachments

### Resource Naming Strategy

The infra module has a sophisticated naming system to handle AWS limits (IAM role: 64 chars, S3: 63 chars):

```hcl
# Short names for long use cases
use_case_short_map = {
  "fraud_detection"      = "fraud"
  "kyc_banking"          = "kyc"
  "customer_engagement"  = "custeng"
  ...34 total mappings
}

# Deterministic truncation for unknown names > 15 chars:
# first_8_chars + "-" + md5(full_name)[0:6]
_use_case_truncated = length(raw) <= 15 ? raw : "${substr(raw, 0, 8)}-${substr(md5(raw), 0, 6)}"

# Final prefix
resource_prefix = "${project_name}-${use_case_id_lower}-${framework_short_lower}"
```

---

## Runtime Terraform

**Path**: `applications/fsi_foundry/foundations/iac/agentcore/runtime/main.tf`

The runtime module:
1. Uses `hashicorp/aws ~> 5.0` and `hashicorp/null ~> 3.0` providers
2. Creates a **CloudFormation stack** (`aws_cloudformation_stack`) that deploys the `agentcore_runtime.yaml` template
3. Passes **all parameters** to the CFN stack from Terraform variables
4. Uses `null_resource` with local-exec provisioner for post-deploy validation

### How Image Digest Is Passed

```hcl
resource "aws_cloudformation_stack" "agentcore_runtime" {
  name          = "${local.stack_name}"
  template_body = file("${path.module}/agentcore_runtime.yaml")

  parameters = {
    AgentName       = var.agent_name
    RoleArn         = var.role_arn
    ECRRepository   = var.ecr_repository_uri
    ImageTag        = var.image_tag  # Can be "latest" or "v1.0.0@sha256:abc123..."
    DataBucket      = var.data_bucket
    BedrockModelId  = var.bedrock_model_id
    UseCaseId       = var.use_case_id
    UseCaseName     = var.use_case_name
    Framework       = var.framework
    Environment     = var.environment
    AwsRegion       = var.aws_region
    EnableTracing   = var.enable_tracing
    LangfuseHost    = var.langfuse_host
    LangfuseSecretName = var.langfuse_secret_name
    GuardrailId     = var.guardrail_id
    GuardrailVersion = var.guardrail_version
  }

  capabilities = ["CAPABILITY_IAM"]

  tags = {
    UseCase     = var.use_case_id
    Framework   = var.framework
    Environment = var.environment
  }
}
```

---

## Environment Variables

### Variables Set in CloudFormation (Runtime)

| Variable | Value | Purpose |
|----------|-------|---------|
| `DEPLOYMENT_MODE` | `agentcore` | Selects AgentCore adapter in main.py |
| `AWS_REGION` | `us-east-1` | AWS SDK default region |
| `AGENT_FRAMEWORK` | `strands` or `langchain_langgraph` | Which framework to load |
| `BEDROCK_MODEL_ID` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Default model |
| `S3_BUCKET_NAME` | Bucket name | Customer data storage |
| `APP_ENV` | `dev`/`staging`/`production` | Controls log format (JSON in prod) |
| `USE_CASE_ID` | `kyc_banking` | Which use case module to import |
| `AGENT_NAME` | `kyc_banking` | Agent identifier |
| `DATA_PREFIX` | `samples/kyc_banking` | S3 prefix for data files |
| `ENABLE_TRACING` | `true`/`false` | Enables Langfuse/OTEL tracing |
| `LANGFUSE_HOST` | URL | Langfuse server endpoint |
| `LANGFUSE_SECRET_NAME` | Secret name | For API keys in Secrets Manager |
| `GUARDRAIL_ID` | Guardrail ID | Bedrock Guardrail to apply |
| `GUARDRAIL_VERSION` | Version string | Guardrail version |
| `OTEL_RESOURCE_ATTRIBUTES` | Comma-separated KV | Applied to every span |
| `OTEL_PYTHON_DISTRO` | `aws_distro` | Use ADOT for auto-instrumentation |
| `OTEL_PYTHON_CONFIGURATOR` | `aws_configurator` | ADOT configurator |
| `AGENT_OBSERVABILITY_ENABLED` | `true`/`false` | CloudWatch GenAI Observability |

### Variables Set in Dockerfile (Build-time)

| Variable | Purpose |
|----------|---------|
| `DEPLOYMENT_MODE=agentcore` | Baked into image |
| `USE_CASE_ID=${USE_CASE_ID}` | Baked from build arg |
| `FRAMEWORK=${FRAMEWORK}` | Baked from build arg |

---

## Health Check

### Mechanism

```
Endpoint: GET http://localhost:8080/health
Interval: 30s
Timeout: 10s
Start Period: 5s
Retries: 3
Tool: curl -f (fail silently on HTTP errors)
```

### How It Works

1. The **Dockerfile HEALTHCHECK** runs `curl -f http://localhost:8080/health || exit 1`
2. The **BedrockAgentCoreApp** (from `bedrock-agentcore` SDK) automatically exposes a `/health` endpoint on port 8080
3. AgentCore's control plane also probes this endpoint to determine container readiness
4. Container is considered unhealthy after 3 consecutive failures (30s apart)

### Why curl is installed

The `apt-get install curl` in the Dockerfile exists **solely** for the HEALTHCHECK. The application itself doesn't use curl. Without it, the health check would fail and the container would be marked unhealthy.

---

## Image Tagging Strategy

### Convention: `tag@digest` Pinning

```
# Format used in deploy scripts:
${ECR_REPO_URI}:${TAG}

# Where TAG can be:
# - "latest" (development)
# - "v1.0.0" (versioned release)
# - "dev-abc1234" (feature branch + short SHA)
```

### Digest Capture

After pushing to ECR, the deploy script captures the immutable digest:

```bash
IMAGE_DIGEST=$(aws ecr describe-images \
  --repository-name ${ECR_REPO_NAME} \
  --image-ids imageTag=${TAG} \
  --query 'imageDetails[0].imageDigest' \
  --output text)
```

This digest (e.g., `sha256:abc123...`) is then passed to the runtime Terraform as the `image_tag` variable, ensuring the exact image bytes are deployed regardless of tag mutations.

### ECR Lifecycle

Only **5 images** are kept (per ECR lifecycle policy). Old images are automatically expired.

---

## Full Deploy Sequence

**Script**: `applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh`

### Numbered Steps

```
1. VALIDATE PREREQUISITES
   ├── Check AWS CLI configured
   ├── Check Docker daemon running  
   ├── Check Terraform installed (>= 1.0)
   ├── Check docker buildx available
   └── Validate required env vars (AWS_REGION, USE_CASE_ID, FRAMEWORK)

2. DEPLOY INFRASTRUCTURE (Terraform infra/)
   ├── terraform init (infra module)
   ├── terraform plan -out=tfplan
   ├── terraform apply tfplan
   └── Capture outputs:
       ├── ecr_repository_uri
       ├── ecr_repository_name  
       ├── iam_role_arn
       ├── s3_bucket_name
       └── data_bucket_name

3. BUILD DOCKER IMAGE (ARM64)
   ├── Compute image name: ava-{use_case}-{framework}-agentcore:{tag}
   ├── docker buildx build --platform linux/arm64 \
   │     --build-arg USE_CASE_ID=${USE_CASE_ID} \
   │     --build-arg FRAMEWORK=${FRAMEWORK} \
   │     -f Dockerfile.agentcore \
   │     -t ${ECR_REPO_URI}:${TAG} \
   │     --load .
   └── Verify image exists locally

4. PUSH TO ECR
   ├── aws ecr get-login-password | docker login
   ├── docker push ${ECR_REPO_URI}:${TAG}
   └── Capture IMAGE_DIGEST

5. UPLOAD DATA (if data_path provided)
   ├── aws s3 sync ${DATA_PATH} s3://${DATA_BUCKET}/samples/${USE_CASE_ID}/
   └── Verify upload

6. DEPLOY RUNTIME (Terraform runtime/)
   ├── terraform init (runtime module)
   ├── terraform plan with variables:
   │     -var="image_tag=${TAG}" (or tag@digest)
   │     -var="ecr_repository_uri=${ECR_REPO_URI}"
   │     -var="role_arn=${IAM_ROLE_ARN}"
   │     -var="data_bucket=${DATA_BUCKET}"
   │     -var="use_case_id=${USE_CASE_ID}"
   │     -var="framework=${FRAMEWORK}"
   │     ... (all CFN parameters)
   ├── terraform apply
   └── Capture outputs:
       ├── agent_runtime_id
       ├── agent_runtime_arn
       └── agent_runtime_name

7. VALIDATE DEPLOYMENT
   ├── Wait for runtime to become ACTIVE
   ├── Check CloudFormation stack status
   └── Print deployment summary
```

---

## Entry Point

**Path**: `applications/fsi_foundry/foundations/src/main.py`

### Flow

```python
# 1. Configure logging
configure_logging(level=settings.log_level, json_format=settings.app_env == "production")

# 2. Initialize tracing (before agent imports)
if settings.enable_tracing:
    setup_tracing()  # Sets OTEL env vars for opentelemetry-instrument

# 3. Dynamically import use case module
importlib.import_module(f"use_cases.{settings.agent_name}")
# e.g., "use_cases.kyc_banking" → registers agent in registry

# 4. Select adapter based on DEPLOYMENT_MODE
if DEPLOYMENT_MODE == "agentcore":
    from adapters.agentcore_adapter import create_agentcore_app
    app = create_agentcore_app(AGENT_NAME)
    if __name__ == "__main__":
        app.run()  # Starts AgentCore HTTP server on :8080
```

### Three Deployment Modes

| Mode | Adapter | Port | Server |
|------|---------|------|--------|
| `fastapi` | `fastapi_adapter` | 8000 | Uvicorn |
| `agentcore` | `agentcore_adapter` | 8080 | BedrockAgentCoreApp |
| `lambda` | `lambda_adapter` | N/A | AWS Lambda runtime |

---

## AgentCore Adapter

**Path**: `applications/fsi_foundry/foundations/src/adapters/agentcore_adapter.py`

```python
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from base.registry import get_agent

def create_agentcore_app(agent_name: str) -> BedrockAgentCoreApp:
    agent_config = get_agent(agent_name)
    app = BedrockAgentCoreApp()
    
    @app.entrypoint
    async def agent_invocation(payload: dict, context) -> dict:
        request = agent_config.request_model(**payload)
        response = await agent_config.entry_point(request)
        return response.model_dump(mode="json")
    
    return app
```

### Key Design Patterns

1. **Generic adapter** — works with ANY registered agent (KYC, fraud, claims, etc.)
2. **Registry pattern** — `get_agent(name)` returns agent config with `request_model` and `entry_point`
3. **Pydantic validation** — request payload validated against agent's request model
4. **JSON response** — `model_dump(mode="json")` ensures JSON-serializable output
5. **Optional Langfuse** — if tracing enabled, wraps entrypoint with `@observe` decorator
6. **SDK class**: `BedrockAgentCoreApp` from `bedrock-agentcore` package handles HTTP server, health endpoint, and protocol

---

## Adapters

**Path**: `applications/fsi_foundry/foundations/src/adapters/`

| File | Purpose |
|------|---------|
| `__init__.py` | Package marker |
| `agentcore_adapter.py` | BedrockAgentCore Runtime adapter (port 8080, OTEL) |
| ~~`fastapi_adapter.py`~~ | Not in this directory listing — likely in a different adapters location |
| ~~`lambda_adapter.py`~~ | Not in this directory listing — referenced by main.py |

> **Note**: The adapters directory in `foundations/src/adapters/` only contains `__init__.py` and `agentcore_adapter.py`. The fastapi_adapter and lambda_adapter are imported from the same package path but may be in a parent or shared location.

---

## Full Deploy vs App-Only Deploy

### Full Deploy (`scripts/deploy/full/deploy_agentcore.sh`)

- **Creates ALL infrastructure** from scratch
- Runs Terraform `infra/` module (S3, ECR, IAM)
- Builds Docker image
- Pushes to ECR
- Runs Terraform `runtime/` module (CloudFormation stack)
- **Use when**: First deployment, or infrastructure changes needed

### App-Only Deploy (`scripts/deploy/app/deploy_agentcore.sh`)

- **Assumes infrastructure exists** (ECR repo, IAM role, S3 bucket)
- Reads existing Terraform outputs (ECR URI, role ARN, etc.)
- Builds new Docker image
- Pushes to ECR
- Updates only the CloudFormation stack (new image tag/digest)
- **Use when**: Code changes only, no infra modifications
- **Faster**: Skips ~60% of the deploy time (no infra terraform plan/apply)

### Comparison

| Aspect | Full Deploy | App-Only Deploy |
|--------|-------------|-----------------|
| Duration | ~8-12 min | ~3-5 min |
| Terraform infra | ✅ Creates/updates | ❌ Skips |
| Docker build | ✅ | ✅ |
| ECR push | ✅ | ✅ |
| Terraform runtime | ✅ Creates stack | ✅ Updates stack |
| Data upload | ✅ (if data_path set) | ❌ Skips |
| First-time deploy | ✅ Required | ❌ Will fail |
| Code-only update | ✅ Works but slow | ✅ Preferred |

---

## Common Failure Modes

### 1. AMD64 Image on AgentCore

**Symptom**: Container crashes immediately after deployment, no logs  
**Cause**: Built with `--platform linux/amd64` instead of `linux/arm64`  
**Fix**: Always use `docker buildx build --platform linux/arm64`

### 2. Health Check Timeout (504)

**Symptom**: Runtime stuck in CREATING state, eventually fails  
**Cause**: App not listening on port 8080, or `/health` endpoint not responding within 10s  
**Fix**: Ensure `EXPOSE 8080` in Dockerfile, verify `BedrockAgentCoreApp` is starting correctly

### 3. Missing curl in Container

**Symptom**: Container starts but is marked unhealthy  
**Cause**: HEALTHCHECK uses `curl` but it's not installed  
**Fix**: `apt-get install -y curl` in Dockerfile (already present in AVA)

### 4. ECR Access Denied

**Symptom**: `AccessDeniedException` when AgentCore tries to pull image  
**Cause**: IAM role missing `ecr:BatchGetImage` or `ecr:GetAuthorizationToken`  
**Fix**: Verify all ECR policy statements are attached to the runtime role

### 5. Bedrock Model Access

**Symptom**: Agent responds with "access denied" errors at invocation time  
**Cause**: IAM role doesn't have `bedrock:InvokeModel` for the specified model  
**Fix**: Ensure `module.shared.bedrock_policy_arn` is attached and covers the model region

### 6. Import Error on Use Case

**Symptom**: Container starts but crashes with `ImportError: Failed to import use case 'X'`  
**Cause**: `USE_CASE_ID` doesn't match an existing module in `use_cases/` directory  
**Fix**: Verify the `--build-arg USE_CASE_ID=X` matches a directory in `use_cases/X/src/{framework}/`

### 7. CloudFormation Stack Rollback

**Symptom**: Terraform apply fails with "ROLLBACK_COMPLETE"  
**Cause**: Previous failed deployment left stack in bad state  
**Fix**: Delete the failed CFN stack manually, then re-run terraform apply

### 8. S3 Bucket Name Collision

**Symptom**: Terraform fails creating S3 bucket  
**Cause**: Bucket names are globally unique; naming collision with another account  
**Fix**: The naming convention includes account_id to prevent this, but check for leftover buckets

### 9. IAM Role Name Too Long

**Symptom**: Terraform fails with "role name exceeds 64 characters"  
**Cause**: Long use case name + framework + region exceeds IAM limit  
**Fix**: The `use_case_short_map` and truncation logic should handle this; if not, add a mapping

### 10. OTEL Instrumentation Crash

**Symptom**: Container crashes with Python import errors related to opentelemetry  
**Cause**: `aws-opentelemetry-distro` version incompatible with other packages  
**Fix**: Pin `aws-opentelemetry-distro>=0.10.1` (already in Dockerfile); check for conflicts

---

## Quick Reference Commands

```bash
# Full deploy (first time)
cd applications/fsi_foundry
./scripts/deploy/full/deploy_agentcore.sh \
  --use-case kyc_banking \
  --framework strands \
  --region us-east-1

# App-only deploy (code update)
./scripts/deploy/app/deploy_agentcore.sh \
  --use-case kyc_banking \
  --framework strands \
  --region us-east-1

# Manual Docker build for testing
docker buildx build \
  --platform linux/arm64 \
  --build-arg USE_CASE_ID=kyc_banking \
  --build-arg FRAMEWORK=strands \
  -f foundations/docker/Dockerfile.agentcore \
  -t ava-kyc-strands-agentcore:dev \
  --load .

# Run locally for testing (not on ARM = won't fully work, but validates startup)
docker run -p 8080:8080 \
  -e AWS_REGION=us-east-1 \
  -e BEDROCK_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0 \
  -e S3_BUCKET_NAME=my-bucket \
  ava-kyc-strands-agentcore:dev
```

---

## Pattern Comparison Table

| Feature | EC2 (FastAPI) | AgentCore | Lambda |
|---------|---------------|-----------|--------|
| Architecture | AMD64 | **ARM64 (required)** | N/A (ZIP) |
| Port | 8000 | 8080 | N/A |
| Server | Uvicorn (FastAPI) | BedrockAgentCoreApp | AWS Lambda Runtime |
| Entry point | `uvicorn main:app` | `opentelemetry-instrument python -m main` | `main.lambda_handler` |
| Health check | None built-in | `GET /health` | N/A |
| DEPLOYMENT_MODE | `fastapi` | `agentcore` | `lambda` |
| Auto-instrumentation | No | Yes (ADOT) | No |
| Scaling | EC2 ASG / ALB | **AgentCore managed** | Lambda concurrency |
| Docker | Yes | Yes | No (ZIP package) |
| Cost model | EC2 hours | Per-invocation | Per-invocation |

---

*Document generated from source analysis of aws-samples/sample-agentic-value-accelerator repository.*
