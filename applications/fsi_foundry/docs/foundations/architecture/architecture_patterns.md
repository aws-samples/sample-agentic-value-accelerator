# Architecture

FSI Foundry deploys multi-agent AI systems on AWS using **Amazon Bedrock AgentCore** — a fully managed runtime for hosting, scaling, and observing AI agents.

## Platform Architecture Overview

FSI Foundry follows a clean architecture with clear separation between foundations and use case layers:

```mermaid
graph TB
    subgraph Deployment["DEPLOYMENT LAYER"]
        AgentCore[AgentCore Adapter]
        Registry[Agent Registry]
        
        AgentCore --> Registry
    end
    
    subgraph Applications["USE CASE LAYER"]
        UC1[KYC Risk Assessment]
        UC2[Agentic Payments]
        UC3[Fraud Detection]
        UC4[Customer Service]
        UCN[... 30 more use cases]
    end
    
    subgraph Foundations["FOUNDATIONS LAYER"]
        OrchPatterns[Orchestration Patterns]
        Tools[Shared Tools]
        Utils[Utilities]
    end
    
    Registry --> UC1
    Registry --> UC2
    Registry --> UC3
    Registry --> UC4
    Registry -.-> UCN
    UC1 --> OrchPatterns
    UC2 --> OrchPatterns
    UC3 --> OrchPatterns
    UC4 --> OrchPatterns
    OrchPatterns --> Tools
    OrchPatterns --> Utils
```

**Key Components:**

- **Deployment Layer**: AgentCore adapter that handles protocol translation between Bedrock AgentCore Runtime and the agent registry
- **Agent Registry**: Central registry where use cases register their agents
- **Use Case Layer**: 34 FSI-specific use cases, each with orchestrators and specialist agents
- **Foundations Layer**: Shared orchestration patterns, tools, and utilities

---

## AgentCore Architecture

**AWS-native serverless agent hosting**

Leverages the AgentCore adapter with Amazon Bedrock AgentCore Runtime for fully managed agent deployment with built-in observability, auto-scaling, and AWS service integration.

**Key Characteristics:**
- AgentCore adapter for AWS-native deployment
- Fully managed by AWS — no servers to provision
- Built-in observability and tracing
- Automatic scaling based on demand
- Native AWS service integration
- Dual framework support — Strands Agents SDK and LangGraph/LangChain

**[→ View Detailed AgentCore Architecture](architecture_agentcore.md)**

---

## Per-Use-Case Deployment

Each use case is deployed as an isolated stack with its own infrastructure:

```mermaid
graph TB
    subgraph UseCase["Per-Use-Case Stack"]
        ECR["ECR<br/>(Agent Image)"]
        Runtime["AgentCore Runtime<br/>(Agent Host)"]
        UI["CloudFront + S3<br/>(React Frontend)"]
        Lambda["Lambda Proxy<br/>(API Handler)"]
        APIGW["API Gateway"]
        DDB["DynamoDB<br/>(Sessions)"]
    end

    subgraph Shared["Shared Infrastructure"]
        S3Data["S3<br/>(Sample Data)"]
        IAM["IAM Roles"]
        CW["CloudWatch<br/>(Logs + Metrics)"]
    end

    APIGW --> Lambda
    Lambda --> Runtime
    Lambda --> DDB
    UI --> APIGW
    Runtime --> ECR
    Runtime --> S3Data
    Runtime --> CW
```

**Features:**
- **Workspace-based state isolation**: Each use case/framework combination gets its own Terraform workspace
- **Resource naming isolation**: All resources include the use case ID and framework short name
- **Framework isolation**: Deploy the same use case with different frameworks (Strands and LangGraph) simultaneously
- **Independent lifecycle**: Deploy, update, and destroy use cases independently

---

## Next Steps

- [AgentCore Architecture Details](architecture_agentcore.md) — Deep dive into AgentCore runtime design
- [Deployment Guide](../deployment/deployment_agentcore.md) — Step-by-step deployment instructions
