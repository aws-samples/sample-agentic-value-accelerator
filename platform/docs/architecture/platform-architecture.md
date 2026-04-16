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
        Routes["API Routes<br/>• /deployments<br/>• /templates<br/>• /applications<br/>• /tests"]
        Services["Services<br/>• Pipeline Orchestration<br/>• Packaging Engine<br/>• Deployment Manager<br/>• Test Runner"]
    end

    subgraph Storage["Data Layer"]
        DDB_Deploy["DynamoDB<br/>Deployments"]
        DDB_Meta["DynamoDB<br/>Metadata"]
        S3_Archives["S3<br/>Project Archives"]
        S3_State["S3<br/>Terraform State"]
        ECR["ECR<br/>Container Registry"]
    end

    subgraph Pipeline["CI/CD Pipeline"]
        SF["Step Functions<br/>Orchestrator"]
        EB["EventBridge<br/>Lifecycle Events"]
        CB["CodeBuild<br/>Build + Deploy"]
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
    Services --> ECR
    Services --> SF

    SF --> EB
    SF --> CB

    CB --> S3_State
    CB --> AgentCore
    CB --> Lambda
    CB --> S3_UC
    S3_UC --> CF_UC
    Lambda --> AgentCore
```

## Deployment Pipeline

When a user clicks "Deploy" in the Control Plane UI, the following pipeline executes:

```mermaid
sequenceDiagram
    participant UI as Control Plane UI
    participant API as Backend API
    participant SF as Step Functions
    participant CB as CodeBuild
    participant TF as Terraform
    participant AWS as AWS Services

    UI->>API: POST /deployments (use case, framework, params)
    API->>API: Package source code into zip
    API->>S3: Upload archive to S3
    API->>SF: Start pipeline execution
    
    SF->>SF: Validate inputs
    SF->>CB: Start CodeBuild job
    
    Note over CB: Build Phase
    CB->>CB: Extract archive
    CB->>CB: Docker build + push to ECR
    
    Note over CB: Infrastructure Phase
    CB->>TF: terraform init + plan + apply (infra)
    TF->>AWS: Create ECR, S3, IAM, networking
    
    CB->>TF: terraform init + plan + apply (runtime)
    TF->>AWS: Deploy AgentCore Runtime
    
    Note over CB: UI Phase
    CB->>TF: terraform init + plan + apply (ui)
    TF->>AWS: Create S3 bucket, CloudFront, Lambda proxy, API Gateway
    CB->>CB: npm install + vite build
    CB->>S3: aws s3 sync dist/ to UI bucket
    CB->>AWS: CloudFront cache invalidation
    
    SF->>SF: Capture outputs
    SF->>DDB: Store deployment outputs
    SF-->>UI: Deployment complete
```

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


### Backend

| Technology | Purpose |
|------------|---------|
| FastAPI | REST API framework |
| Python 3.11 | Runtime |
| ECS Fargate | Container hosting |
| Pydantic | Request/response validation |
| Boto3 | AWS SDK for Python |

**Key services:**
- **Pipeline Service** — Orchestrates Step Functions execution for deployments
- **Packaging Service** — Zips use case source, IaC, UI, Docker, and sample data into deployment archives
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
        EB["eventbridge<br/>Lifecycle Events"]
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
    SF --> CB
    SF --> EB
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
| **CodeBuild** | CI/CD build execution in isolated containers |
| **Step Functions** | Deployment pipeline orchestration |
| **EventBridge** | Deployment lifecycle events with DLQ |
| **ECR** | Docker image registry |
| **Lambda** | Per-use-case UI proxy and async worker |
| **Bedrock AgentCore** | Managed agent runtime hosting |
| **CloudWatch** | Logs, metrics, alarms, dashboards |
