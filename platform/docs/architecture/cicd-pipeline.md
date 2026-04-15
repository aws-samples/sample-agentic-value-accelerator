# AVA CI/CD Pipeline Architecture

The AVA platform uses AWS CodeBuild orchestrated by Step Functions to automate the full deployment lifecycle for agent applications.

## Pipeline Overview

```mermaid
flowchart TB
    subgraph Trigger["Trigger"]
        UI["Control Plane UI<br/>Deploy Button"]
        API["Backend API<br/>POST /deployments"]
    end

    subgraph Orchestration["Step Functions Orchestrator"]
        Validate["Validate Inputs"]
        Package["Package Source<br/>(zip to S3)"]
        Build["Start CodeBuild"]
        Monitor["Monitor Build"]
        Capture["Capture Outputs"]
        Record["Record to DynamoDB"]
    end

    subgraph CodeBuild["CodeBuild Execution"]
        Install["Install Phase<br/>Terraform, CDK, Node.js"]
        PreBuild["Pre-Build Phase<br/>Extract archive, Docker cache"]
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

    UI --> API --> Validate
    Validate --> Package --> Build --> Monitor
    Monitor --> Capture --> Record

    Build --> Install --> PreBuild --> BuildPhase
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

### Pre-Build Phase

Prepares the build environment:

1. **Docker cache** — Pre-pulls base images from ECR to avoid Docker Hub rate limits
2. **Archive extraction** — Downloads deployment zip from S3 and extracts to `/tmp/workspace`
3. **Cross-account support** — Assumes target IAM role if `TARGET_ROLE_ARN` is set
4. **Output merger** — Writes a Python script to merge outputs from multiple Terraform stages

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
| Docker build | `\|\| { echo "ERROR"; exit 1; }` | Fails build immediately |
| Terraform apply | `\|\| { echo "ERROR"; exit 1; }` | Fails build immediately |
| UI build (npm) | `\|\| { echo "ERROR"; exit 1; }` | Prevents empty S3 sync |
| UI dist check | `if [ ! -f dist/index.html ]` | Prevents deploying empty build |
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
| `ARCHIVE_BUCKET` | Backend API | S3 bucket containing deployment zip |
| `ARCHIVE_KEY` | Backend API | S3 key for deployment zip |
| `STATE_BUCKET` | Infrastructure | Terraform remote state bucket |
| `LOCK_TABLE` | Infrastructure | DynamoDB lock table for Terraform |
| `DEPLOYMENTS_TABLE` | Infrastructure | DynamoDB table for deployment metadata |

## Infrastructure

The CodeBuild project is provisioned via Terraform:

- **Compute**: ARM64 (`BUILD_GENERAL1_LARGE`), Linux container
- **Timeout**: 60 minutes
- **Logging**: CloudWatch Logs (14-day retention)
- **Permissions**: IAM role with S3, ECR, DynamoDB, Terraform, CloudFormation, Bedrock, Lambda, CloudFront access
- **Buildspec**: Inline (managed via Terraform `file()` function)
