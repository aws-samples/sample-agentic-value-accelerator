# AVA CI/CD Pipeline Architecture

The AVA platform uses AWS CodeBuild orchestrated by Step Functions to automate the full deployment lifecycle for agent applications.

## Pipeline Overview

```mermaid
flowchart TB
    subgraph Trigger["Trigger"]
        UI_S3["UI: Quick Deploy<br/>POST /applications/foundry/deploy"]
        UI_Git["UI: Deploy from Git<br/>POST /applications/foundry/deploy-from-git"]
        GitPush["Git push / PR merge<br/>(EventBridge rule on CodeCommit repo)"]
    end

    subgraph Sources["Deployment Sources"]
        S3Src["S3 Archive<br/>(zipped by backend)"]
        CC["CodeCommit Repo<br/>fsi-foundry-*"]
    end

    subgraph Orchestration["Step Functions Orchestrator"]
        Validate["Validate Inputs"]
        Normalize["NormalizeBuildInput<br/>(fill missing s3_*/codecommit_*)"]
        Build["Start CodeBuild<br/>(env vars: ARCHIVE_*, CODECOMMIT_*)"]
        Monitor["Monitor Build"]
        Capture["Capture Outputs"]
        Record["Record to DynamoDB"]
    end

    subgraph CodeBuildExec["CodeBuild Execution"]
        Install["Install Phase<br/>Terraform, CDK, Node.js"]
        SourceAcq["Source Acquisition<br/>git clone OR s3 cp + unzip"]
        PreBuild["Pre-Build Phase<br/>Docker cache, cross-account role"]
        BuildPhase["Build Phase"]
    end

    subgraph BuildTypes["Build Routing"]
        CustomDeploy["Custom deploy.sh<br/>(Reference Implementations)"]
        Terraform["Terraform Flow<br/>(FSI Foundry)"]
        CDK["CDK Flow<br/>(Shopping Concierge)"]
        CFN["CloudFormation Flow"]
    end

    subgraph TerraformStages["Terraform Multi-Stage (FSI Foundry)"]
        Stage1["Stage 1: Infrastructure<br/>ECR, S3, IAM, networking"]
        Stage2["Stage 2: Docker Build<br/>Build image, push to ECR"]
        Stage3["Stage 3: Runtime<br/>Deploy AgentCore Runtime"]
        Stage4["Stage 4: UI<br/>Build React app, deploy to S3 + CloudFront"]
    end

    subgraph PostBuild["Post-Build"]
        S3Out["Upload outputs to S3"]
        DDBOut["Store outputs in DynamoDB"]
        Events["EventBridge notification"]
    end

    UI_S3 --> S3Src
    UI_Git --> CC
    GitPush --> CC

    S3Src --> Validate
    CC --> Validate
    Validate --> Normalize --> Build --> Monitor
    Monitor --> Capture --> Record

    Build --> Install --> SourceAcq --> PreBuild --> BuildPhase

    SourceAcq -.->|"if CODECOMMIT_REPO set"| CC
    SourceAcq -.->|"else"| S3Src

    BuildPhase --> CustomDeploy
    BuildPhase --> Terraform
    BuildPhase --> CDK
    BuildPhase --> CFN

    Terraform --> Stage1 --> Stage2 --> Stage3 --> Stage4

    Stage4 --> PostBuild
    CustomDeploy --> PostBuild
    CDK --> PostBuild

    PostBuild --> S3Out
    PostBuild --> DDBOut
    PostBuild --> Events
```

## Build Phases

### Install Phase

Installs tools required for deployment:

- **Terraform** >= 1.5.7 (ARM64)
- **AWS CDK** + TypeScript
- **Node.js** 22+ (upgraded at runtime if needed for Vite 8)
- **jq** for JSON processing

### Source Acquisition Phase

Runs before the main build. Detects which source type the Step Functions input supplied and populates `/tmp/workspace` accordingly:

```bash
if [ -n "$CODECOMMIT_REPO" ] && [ -n "$CODECOMMIT_BRANCH" ]; then
  # Git path — clone from CodeCommit
  git config --global credential.helper '!aws codecommit credential-helper $@'
  git config --global credential.UseHttpPath true
  REPO_URL=$(aws codecommit get-repository --repository-name "$CODECOMMIT_REPO" \
    --query 'repositoryMetadata.cloneUrlHttp' --output text)
  git clone --depth 1 --branch "$CODECOMMIT_BRANCH" "$REPO_URL" /tmp/workspace
elif [ -n "$ARCHIVE_BUCKET" ] && [ -n "$ARCHIVE_KEY" ]; then
  # S3 path — download + unzip archive
  aws s3 cp "s3://$ARCHIVE_BUCKET/$ARCHIVE_KEY" /tmp/template.zip
  unzip -o /tmp/template.zip -d /tmp/workspace
else
  echo "ERROR: No valid source specified (neither CodeCommit nor S3 archive)"
  exit 1
fi
```

CodeCommit takes precedence when both sets of variables are present. The Step Functions `NormalizeBuildInput` state guarantees all four variables are always defined — empty strings when not in use — so the `-n` checks work reliably.

### Pre-Build Phase

After source acquisition, prepares the build environment:

1. **Docker cache** — Pre-pulls base images from ECR to avoid Docker Hub rate limits
2. **Cross-account support** — Assumes target IAM role if `TARGET_ROLE_ARN` is set
3. **Output merger** — Writes a Python script to merge outputs from multiple Terraform stages

### Build Phase — Routing

The build phase routes to the appropriate deployment strategy:

```mermaid
flowchart TD
    Start["Build Phase Start"]
    
    Start -->|"destroy.sh exists<br/>+ ACTION=destroy"| Destroy["Run destroy.sh"]
    Start -->|"deploy.sh exists"| Custom["Run deploy.sh<br/>(Reference Implementations)"]
    Start -->|"No custom script"| IaC{"IAC_TYPE?"}
    
    IaC -->|"terraform"| TF{"Multi-stage?<br/>(infra/ + runtime/)"}
    IaC -->|"cdk"| CDK["cdk deploy --all"]
    IaC -->|"cloudformation"| CFN["aws cloudformation deploy"]
    
    TF -->|"Yes"| MultiStage["4-Stage Pipeline"]
    TF -->|"No"| SingleTF["Single terraform apply"]
```

### Terraform Multi-Stage Pipeline (FSI Foundry)

```mermaid
sequenceDiagram
    participant CB as CodeBuild
    participant TF as Terraform
    participant ECR as ECR
    participant AC as AgentCore
    participant S3 as S3
    participant CF as CloudFront

    Note over CB: Stage 1 — Infrastructure
    CB->>TF: terraform apply (infra/)
    TF-->>CB: ECR repo, S3 buckets, IAM roles

    Note over CB: Stage 2 — Docker Build
    CB->>CB: docker build (agent image)
    CB->>ECR: docker push

    Note over CB: Stage 3 — Runtime
    CB->>TF: terraform apply (runtime/)
    TF->>AC: Create/update AgentCore Runtime

    Note over CB: Stage 4 — UI
    CB->>TF: terraform apply (ui_iac/)
    TF-->>CB: S3 bucket, CloudFront, Lambda proxy, API Gateway
    CB->>CB: npm install + vite build
    CB->>CB: Inject runtime-config.json (API endpoint)
    CB->>S3: aws s3 sync dist/ (with --delete)
    CB->>CF: CloudFront cache invalidation
```

### Post-Build Phase

1. Outputs uploaded to `s3://{state-bucket}/{deployment-id}/outputs.json`
2. Outputs stored in DynamoDB `deployments` table
3. EventBridge event emitted for lifecycle tracking

## Error Handling

| Stage | Guard | Behavior |
|-------|-------|----------|
| Step Functions input | `NormalizeBuildInput` Pass state injects empty defaults via `States.JsonMerge` | Keeps `InvokeCodeBuild` JSONPath lookups from failing when a caller only sets the S3 *or* the CodeCommit fields |
| Source acquisition | `if [ -n "$CODECOMMIT_REPO" ]…elif [ -n "$ARCHIVE_BUCKET" ]…else exit 1` | Fails fast with "No valid source specified" if both source sets are empty |
| Git clone | `git clone --depth 1 --branch` exit code | Non-zero exit propagates through `set -e` and fails the phase |
| S3 download | `aws s3 cp` exit code | Non-zero exit fails the phase |
| Docker build | `\|\| { echo "ERROR"; exit 1; }` | Fails build immediately |
| Terraform apply | `\|\| { echo "ERROR"; exit 1; }` | Fails build immediately |
| UI build (npm) | `\|\| { echo "ERROR"; exit 1; }` | Prevents empty S3 sync |
| UI dist check | `if [ ! -f dist/index.html ]` | Prevents deploying empty build |
| Stage 4 gating | `if [ -d ui_iac ] && [ -d ui ]` | Skips UI stage when the bundle doesn't include a frontend |
| deploy.sh | Exit code check | Captures error in outputs |

## Environment Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `DEPLOYMENT_ID` | Backend API | Unique deployment identifier |
| `TEMPLATE_ID` | Backend API | Template or use case identifier |
| `USE_CASE_ID` | Backend API | FSI Foundry use case name |
| `FRAMEWORK` | Backend API | `langchain_langgraph` or `strands` |
| `IAC_TYPE` | Backend API | `terraform`, `cdk`, or `cloudformation` |
| `AWS_TARGET_REGION` | Backend API | Target AWS region |
| `ARCHIVE_BUCKET` | Backend API (Quick Deploy) | S3 bucket containing deployment zip; empty string for Git path |
| `ARCHIVE_KEY` | Backend API (Quick Deploy) | S3 key for deployment zip; empty string for Git path |
| `CODECOMMIT_REPO` | Backend API (Deploy from Git) | CodeCommit repository name (e.g. `fsi-foundry-fraud_detection`); empty string for S3 path |
| `CODECOMMIT_BRANCH` | Backend API (Deploy from Git) | Branch to clone (defaults to `main`); empty string for S3 path |
| `ACTION` | Backend API | `deploy` or `destroy` |
| `STATE_BUCKET` | Infrastructure | Terraform remote state bucket |
| `LOCK_TABLE` | Infrastructure | DynamoDB lock table for Terraform |
| `DEPLOYMENTS_TABLE` | Infrastructure | DynamoDB table for deployment metadata |

All four source fields (`ARCHIVE_*` + `CODECOMMIT_*`) are always passed to CodeBuild. Step Functions' `NormalizeBuildInput` fills in empty strings for whichever pair the caller didn't set, so the source-acquisition script can reliably use `-n` checks to decide which path to take.

## Infrastructure

The CodeBuild project is provisioned via Terraform:

- **Compute**: ARM64 (`BUILD_GENERAL1_LARGE`), Linux container
- **Timeout**: 60 minutes
- **Logging**: CloudWatch Logs (14-day retention)
- **Permissions**: IAM role with S3, ECR, DynamoDB, Terraform, CloudFormation, Bedrock, Lambda, CloudFront access. Also `codecommit:GitPull` + `codecommit:GetRepository` so Stage 0 can clone any `fsi-foundry-*` repo. The ECS task role that runs the backend API gets `codecommit:ListRepositories` + `codecommit:GetRepository` so `GET /api/v1/codecommit/repositories` can enumerate seeded repos for the UI
- **Buildspec**: Inline (managed via Terraform `file()` function); source-acquisition prelude selects Git vs S3 based on env vars
