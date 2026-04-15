# Market Surveillance Architecture

An AI-powered surveillance system for detecting and investigating suspicious trading patterns in Fixed Income markets using multi-agent orchestration on AWS Bedrock AgentCore.

<div align="center">
<img src="../../applications/reference_implementations/market-surveillance/docs/diagram/architecture.png" alt="Market Surveillance Architecture" width="90%" />
</div>

## System Architecture

```mermaid
graph TB
    subgraph Frontend["Frontend — Next.js"]
        App["Trade Alerts App<br/>(Next.js + Cognito Auth)"]
    end

    subgraph CDN["CDN & Security"]
        CF["CloudFront"]
        WAF["AWS WAF"]
        ALB["Application Load Balancer"]
    end

    subgraph AgentLayer["Agent Layer — Strands SDK on AgentCore"]
        Gateway["AgentCore Gateway"]
        Coordinator["Coordinator Agent"]
        DataContract["Data Contract Agent<br/>(Schema queries)"]
        DataEnrichment["Data Enrichment Agent<br/>(Data retrieval)"]
        TradeAnalyst["Trade Analyst Agent<br/>(Pattern detection)"]
        ReportAssembly["Report Assembly Agent<br/>(Audit reports)"]
        EcommSpecialist["E-Comm Specialist Agent"]
    end

    subgraph Data["Data Layer"]
        RDS["Aurora PostgreSQL<br/>(Trade data, accounts,<br/>positions, orders)"]
        DDB["DynamoDB<br/>(Sessions, alerts)"]
        S3Config["S3<br/>(Schema configs,<br/>decision tree rules)"]
        S3Plots["S3<br/>(MSP plots)"]
    end

    subgraph Security["Security & Auth"]
        Cognito["Amazon Cognito<br/>(User Pools)"]
        KMS["AWS KMS<br/>(Encryption)"]
        Guardrail["Bedrock Guardrail"]
    end

    subgraph Infra["Infrastructure"]
        VPC["VPC + Private Subnets"]
        Bastion["Bastion Host<br/>(DB access)"]
        Memory["AgentCore Memory"]
    end

    App --> CF --> WAF --> ALB
    ALB --> Gateway
    App --> Cognito

    Gateway --> Coordinator
    Coordinator --> DataContract
    Coordinator --> DataEnrichment
    Coordinator --> TradeAnalyst
    Coordinator --> ReportAssembly
    Coordinator --> EcommSpecialist

    DataContract --> S3Config
    DataEnrichment --> RDS
    TradeAnalyst --> RDS
    ReportAssembly --> S3Plots
    Coordinator --> DDB
    Coordinator --> Memory
    Coordinator --> Guardrail

    RDS --> VPC
    Bastion --> VPC
    RDS --> KMS
```

## Multi-Agent Coordination

The system uses a **coordinator pattern** where a central agent routes queries to specialized sub-agents:

```mermaid
sequenceDiagram
    participant User
    participant UI as Trade Alerts App
    participant GW as AgentCore Gateway
    participant C as Coordinator
    participant DC as Data Contract
    participant DE as Data Enrichment
    participant TA as Trade Analyst
    participant RA as Report Assembly

    User->>UI: Investigation query
    UI->>GW: POST /mcp (query)
    GW->>C: Route to Coordinator

    C->>C: Analyze query intent

    alt Schema Query
        C->>DC: "What tables have trade data?"
        DC->>S3: Read schema_config.yaml
        DC-->>C: Schema information
    end

    alt Data Retrieval
        C->>DE: "Get trades for account X"
        DE->>RDS: SQL query
        DE-->>C: Trade records
    end

    alt Pattern Analysis
        C->>TA: "Analyze for wash trading"
        TA->>RDS: Fetch trade patterns
        TA->>TA: Apply 29 decision tree rules
        TA-->>C: Risk assessment + alerts
    end

    alt Report Generation
        C->>RA: "Generate audit report"
        RA->>RA: Compile evidence
        RA-->>C: Formatted report
    end

    C-->>GW: Investigation result
    GW-->>UI: Response
    UI-->>User: Display findings
```

## Agents

| Agent | Role | Data Sources |
|-------|------|-------------|
| **Coordinator** | Routes queries, manages workflow, maintains conversation | DynamoDB, AgentCore Memory |
| **Data Contract** | Answers schema questions, maps table relationships | S3 schema config (YAML) |
| **Data Enrichment** | Retrieves and joins trade data from database | Aurora PostgreSQL |
| **Trade Analyst** | Detects suspicious patterns using 29 decision tree rules | Aurora PostgreSQL |
| **Report Assembly** | Compiles audit-ready investigation reports | S3 (plots and evidence) |
| **E-Comm Specialist** | Analyzes electronic communication patterns | Aurora PostgreSQL |

## Infrastructure Modules

The Terraform infrastructure is split into **foundations** (deployed once) and **app-infra** (per-deployment):

| Module | Layer | Purpose |
|--------|-------|---------|
| `cognito` | Foundations | User authentication and authorization |
| `rds` | Foundations | Aurora PostgreSQL for trade data |
| `kms` | Foundations | Encryption keys |
| `ecr` | Foundations | Container registry |
| `s3-agent-configs` | Foundations | Schema configs and decision tree rules |
| `s3-msp-plots` | Foundations | Generated surveillance plots |
| `foundations-output-params` | Foundations | SSM parameters for cross-stack references |
| `agentcore-runtime` | App Infra | Bedrock AgentCore runtime for agents |
| `agentcore-gateway` | App Infra | AgentCore Gateway endpoint |
| `agentcore-memory` | App Infra | Agent conversation memory |
| `bedrock-guardrail` | App Infra | Content filtering and safety |
| `ec2-webapp` | App Infra | Next.js frontend hosting |
| `cloudfront` | App Infra | CDN distribution |
| `alb` | App Infra | Application load balancer |
| `api-gateway` | App Infra | HTTP API |
| `firewall` | App Infra | AWS WAF rules |
| `lambda` | App Infra | Data seeding and utilities |
| `dynamodb` | App Infra | Session and alert storage |
| `bastion` | App Infra | Secure database access |
| `parameters` | App Infra | Runtime configuration |

## Technology Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | Next.js, React, TypeScript, Tailwind CSS |
| **Agent Framework** | Strands Agents SDK |
| **Agent Hosting** | AWS Bedrock AgentCore (Runtime + Gateway + Memory) |
| **Database** | Amazon Aurora PostgreSQL |
| **Auth** | Amazon Cognito |
| **CDN** | Amazon CloudFront + WAF |
| **IaC** | Terraform (multi-module) |
| **Container** | Docker on ECR |
| **Safety** | Bedrock Guardrails |
