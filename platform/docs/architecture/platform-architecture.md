# AVA Platform Architecture

The AVA Control Plane is the central management layer for deploying, operating, and testing AI agent applications on AWS.

## System Architecture

```mermaid
graph TB
    subgraph Users["Users"]
        Browser["Browser"]
    end

    subgraph CloudFront_Layer["CDN Layer"]
        CF_Frontend["CloudFront<br/>(Frontend)"]
        CF_API["API Gateway<br/>(HTTP API)"]
    end

    subgraph Frontend["Frontend — React + TypeScript"]
        S3_Frontend["S3 Static Hosting"]
        React["React 19 + Vite 8<br/>Tailwind CSS"]
    end

    subgraph Auth["Authentication"]
        Cognito["Amazon Cognito<br/>User Pools + RBAC"]
    end

    subgraph Backend["Backend — FastAPI on ECS Fargate"]
        ECS["ECS Fargate Service"]
        API["FastAPI Application"]
        Routes["API Routes<br/>• /deployments<br/>• /templates<br/>• /applications<br/>• /codecommit<br/>• /tests"]
        Services["Services<br/>• Pipeline Orchestration<br/>• Packaging Engine<br/>• Deployment Manager<br/>• Test Runner"]
    end

    subgraph Sources["Deployment Sources"]
        S3_Archives["S3<br/>Project Archives<br/>(Quick Deploy path)"]
        CC["CodeCommit<br/>Pre-seeded use case repos<br/>(Deploy from Git path)"]
    end

    subgraph Storage["Data Layer"]
        DDB_Deploy["DynamoDB<br/>Deployments"]
        DDB_Meta["DynamoDB<br/>Metadata"]
        S3_State["S3<br/>Terraform State"]
        ECR["ECR<br/>Container Registry"]
    end

    subgraph Pipeline["CI/CD Pipeline"]
        SF["Step Functions<br/>Orchestrator<br/>(dual-source)"]
        EB["EventBridge<br/>Lifecycle Events +<br/>Git push triggers"]
        CB["CodeBuild<br/>Build + Deploy<br/>(clones OR unzips)"]
    end

    subgraph Targets["Deployment Targets"]
        AgentCore["Bedrock AgentCore<br/>Runtime"]
        Lambda["Lambda<br/>UI Proxy"]
        CF_UC["CloudFront<br/>Per-Use-Case UI"]
        S3_UC["S3<br/>Use Case Frontend"]
    end

    Browser --> CF_Frontend
    Browser --> CF_API
    CF_Frontend --> S3_Frontend
    S3_Frontend --> React
    CF_API --> ECS
    Browser --> Cognito
    Cognito --> CF_API

    ECS --> API
    API --> Routes
    Routes --> Services

    Services --> DDB_Deploy
    Services --> DDB_Meta
    Services --> S3_Archives
    Services --> CC
    Services --> ECR
    Services --> SF

    SF --> EB
    SF --> CB

    CC -.->|"git push triggers<br/>auto-deploy"| EB
    EB -.->|"invoke"| SF

    S3_Archives -->|"unzip"| CB
    CC -->|"git clone"| CB

    CB --> S3_State
    CB --> AgentCore
    CB --> Lambda
    CB --> S3_UC
    S3_UC --> CF_UC
    Lambda --> AgentCore
```

## Deployment Pipeline

The pipeline is **dual-source** — the same Step Functions / CodeBuild stages run whether the user picked "Quick Deploy (S3)" or "Deploy from Git (CodeCommit)" in the UI. Only the source-acquisition step differs.

### Path A — Quick Deploy (S3)

```mermaid
sequenceDiagram
    participant UI as Control Plane UI
    participant API as Backend API
    participant S3 as S3 Archives
    participant SF as Step Functions
    participant CB as CodeBuild
    participant TF as Terraform
    participant AWS as AWS Services
    participant DDB as DynamoDB

    UI->>API: POST /applications/foundry/deploy (use case, framework, params)
    API->>API: Package source code into zip
    API->>S3: Upload archive
    API->>SF: Start pipeline (s3_bucket, s3_key)

    SF->>SF: Validate inputs
    SF->>SF: NormalizeBuildInput (fill empty codecommit_*)
    SF->>CB: Start CodeBuild job

    Note over CB: Source Phase
    CB->>S3: aws s3 cp + unzip archive -> /tmp/workspace

    Note over CB: Build Phase
    CB->>CB: Docker build + push to ECR

    Note over CB: Infrastructure Phase
    CB->>TF: terraform apply (infra)
    TF->>AWS: Create ECR, S3, IAM, networking
    CB->>TF: terraform apply (runtime)
    TF->>AWS: Deploy AgentCore Runtime

    Note over CB: UI Phase
    CB->>TF: terraform apply (ui_iac)
    TF->>AWS: Create S3, CloudFront, Lambda proxy, API GW
    CB->>CB: npm install + vite build
    CB->>AWS: aws s3 sync dist/ + CloudFront invalidation

    SF->>DDB: Capture outputs
    SF-->>UI: Deployment complete
```

### Path B — Deploy from Git (CodeCommit)

```mermaid
sequenceDiagram
    participant UI as Control Plane UI
    participant API as Backend API
    participant CC as CodeCommit
    participant SF as Step Functions
    participant CB as CodeBuild
    participant TF as Terraform
    participant AWS as AWS Services
    participant DDB as DynamoDB

    UI->>API: GET /codecommit/repositories
    API->>CC: list_repositories + get_repository
    API-->>UI: [fsi-foundry-*] clone URLs + default branches

    UI->>API: POST /applications/foundry/deploy-from-git<br/>(codecommit_repo, codecommit_branch, ...)
    API->>CC: get_repository (verify repo exists)
    API->>SF: Start pipeline (codecommit_repo, codecommit_branch)

    SF->>SF: Validate inputs
    SF->>SF: NormalizeBuildInput (fill empty s3_*)
    SF->>CB: Start CodeBuild job

    Note over CB: Source Phase (git clone instead of unzip)
    CB->>CC: aws codecommit get-repository -> cloneUrlHttp
    CB->>CC: git clone --depth 1 --branch <br/> -> /tmp/workspace

    Note over CB: Remaining phases identical to Path A
    CB->>CB: Docker build + push to ECR
    CB->>TF: terraform apply (infra, runtime, ui_iac)
    CB->>CB: npm install + vite build
    CB->>AWS: aws s3 sync dist/ + CloudFront invalidation

    SF->>DDB: Capture outputs
    SF-->>UI: Deployment complete
```

**Auto-deploy on git push** — EventBridge rules on each seeded CodeCommit repo can also trigger Step Functions automatically when a push lands on `main` or a PR is merged, so developers who clone and modify a repo can just `git push` to redeploy.

## Component Details

### Frontend

| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Vite 8 | Build tooling |
| Tailwind CSS 4 | Styling |
| React Router 7 | Client-side routing |
| Axios | API client |
| Amazon Cognito | Authentication + RBAC |

**Key pages:** Template Catalog, FSI Foundry Use Cases, Reference Implementations, Deployment Detail (with logs, test drawer, pipeline visualization), Documentation

### Backend

| Technology | Purpose |
|------------|---------|
| FastAPI | REST API framework |
| Python 3.11 | Runtime |
| ECS Fargate | Container hosting |
| Pydantic | Request/response validation |
| Boto3 | AWS SDK for Python |

**Key services:**
- **Pipeline Service** — Orchestrates Step Functions execution for deployments (both S3 and CodeCommit sources)
- **Packaging Service** — Zips use case source, IaC, UI, Docker, and sample data into deployment archives (S3 path)
- **CodeCommit Service** — Lists pre-seeded `fsi-foundry-*` repositories and validates selections for the Git deploy path
- **Deployment Manager** — CRUD for deployment lifecycle, status tracking, output capture
- **Test Runner** — Invokes AgentCore runtimes and polls for async results

### Infrastructure (Terraform)

```mermaid
graph LR
    subgraph Modules["Terraform Modules"]
        VPC["networking<br/>VPC + Subnets"]
        ECS["ecs<br/>Fargate Cluster"]
        APIGW["api_gateway<br/>HTTP API"]
        DDB["dynamodb<br/>State Tables"]
        S3["s3<br/>Artifacts + Frontend"]
        CF["cloudfront<br/>CDN"]
        COG["cognito<br/>Auth"]
        ECR["ecr<br/>Container Registry"]
        CB["codebuild<br/>CI/CD Pipeline"]
        CC["codecommit<br/>Pre-seeded Repos"]
        EB["eventbridge<br/>Lifecycle +<br/>Git Triggers"]
        OBS["observability<br/>CloudWatch"]
        SF["step_functions<br/>Orchestration"]
        STATE["state_backend<br/>TF Remote State"]
    end

    VPC --> ECS
    ECS --> APIGW
    APIGW --> CF
    COG --> APIGW
    CB --> ECR
    CB --> S3
    CB --> STATE
    CB --> CC
    SF --> CB
    SF --> EB
    CC --> EB
    OBS --> ECS
    OBS --> CB
```

### Per-Use-Case UI Architecture

Each FSI Foundry use case gets its own isolated frontend deployment:

```mermaid
graph LR
    Browser --> CF["CloudFront"]
    CF -->|"/static/*"| S3["S3 Bucket<br/>(React App)"]
    CF -->|"/api/*"| APIGW["API Gateway"]
    APIGW --> Lambda["Lambda Proxy<br/>(x-origin-secret)"]
    Lambda -->|"POST /api/invoke"| DDB["DynamoDB<br/>(Sessions)"]
    Lambda -->|"async"| Worker["Lambda Worker"]
    Worker --> AgentCore["Bedrock AgentCore<br/>Runtime"]
    Worker --> DDB
    Browser -->|"poll"| Lambda
```

## AWS Services Used

| Service | Role |
|---------|------|
| **ECS Fargate** | Backend API hosting with auto-scaling |
| **API Gateway** | HTTP API with VPC Link for private integration |
| **CloudFront** | CDN for frontend + per-use-case UIs |
| **S3** | Static hosting, artifacts, Terraform state |
| **DynamoDB** | Deployment state, metadata, session tracking |
| **Cognito** | User authentication with RBAC (admin/viewer) |
| **CodeBuild** | CI/CD build execution in isolated containers (dual-source: S3 archive or Git clone) |
| **CodeCommit** | Pre-seeded `fsi-foundry-*` repositories for the "Deploy from Git" path |
| **Step Functions** | Deployment pipeline orchestration (source-agnostic after input normalization) |
| **EventBridge** | Deployment lifecycle events with DLQ + Git push / PR-merge triggers per repo |
| **ECR** | Docker image registry |
| **Lambda** | Per-use-case UI proxy and async worker |
| **Bedrock AgentCore** | Managed agent runtime hosting |
| **CloudWatch** | Logs, metrics, alarms, dashboards |
