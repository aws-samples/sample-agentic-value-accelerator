<div align="center">

# AVA - Agentic Value Accelerator

**Plan, build, operate, and secure AI agents for financial services on AWS.**

An open-source platform that unifies use cases, reference apps, apps generation from guided-prompt, managed Frontier Agents, custom agents, and reusable tools on Amazon Bedrock AgentCore.


[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.11+-green.svg)](https://python.org)
[![AWS](https://img.shields.io/badge/AWS-Bedrock_AgentCore-orange.svg)](https://aws.amazon.com/bedrock/agentcore/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev)
[![Terraform](https://img.shields.io/badge/IaC-Terraform-7B42BC.svg)](https://www.terraform.io)

<br/>

<img src="platform/docs/imgs/home/home_v0.png" alt="AVA Control Plane" width="90%" />

<br/>

[Getting Started](#getting-started) | [Plan](#plan) | [Platform](#platform) | [Applications](#applications) | [Architecture](#architecture) | [Documentation](#documentation) | [Contacts](#contacts)

</div>

---

## Key Features

- **34 FSI Use Cases** — Production-ready multi-agent POCs across banking, payments, insurance, capital markets, operations, risk & compliance, and modernization
- **Dual Framework Support** — Every use case implemented in both LangGraph/LangChain and Strands Agents SDK — pick the one your team prefers
- **Reference Implementations** — Fork-and-customize full-stack apps with dedicated frontend, backend, and infrastructure (Market Surveillance, Shopping Concierge, Case Management, Agent Safety)
- **Agent-as-a-Service** — Deploy Amazon's managed Frontier Agents (DevOps, Security, Kiro) into your account, or build Custom Agents on Bedrock AgentCore
- **App Factory** — Describe your use case in plain language; the pipeline AI-generates the agent code plus Terraform and deploys it to AgentCore — no coding required
- **Tools Factory** — Pre-built catalog (MCP Gateway, Knowledge Base, Code Interpreter, Web Browser, and more) plus custom tools from Lambda, APIs, or MCP servers
- **Full Control Plane** — React + FastAPI web UI for browsing, deploying, testing, managing, and observing every agent application
- **One-Click Deployment** — Deploy any use case from the UI; CI/CD (CodeBuild + Step Functions + Terraform/CDK) provisions infrastructure automatically
- **Dual Deployment Paths** — Quick Deploy (S3 archive) for business users, Deploy from Git (CodeCommit) for developers who want to customize source first
- **Built-in Observability** — Langfuse v3 + OpenTelemetry stack for agent tracing, metrics, prompt management, and evaluation — deploy once, connect every use case
- **Built for AWS** — Bedrock AgentCore, ECS, Lambda, DynamoDB, CloudFront, Cognito, S3, Step Functions, CodeBuild, and more

<div align="center">
<video src="https://github.com/user-attachments/assets/4d55eba1-dd90-4a92-930d-ad4b220141aa" width="90%" controls></video>
</div>

---

## Plan

Strategic guidance and frameworks to facilitate AI transformation across enterprise leadership personas. These documents help business, technology, and risk leaders identify, evaluate, and prioritize agentic AI use cases that deliver measurable value.

| Resource | Description |
|----------|-------------|
| [**Use Case Discovery Guide**](plan/UseCaseGuidance.md) | 8-step framework for enterprise leaders to identify high-value agentic AI use cases — covers bounded autonomy, measurable outcomes, and governance across industries |

> More strategic planning resources coming soon — persona-specific playbooks (CEO, CIO, CTO, CFO, CRO, CDO), ROI frameworks, and industry-specific adoption guides.

---

## Platform

The AVA Control Plane is a web-based management layer for deploying and operating agent applications on AWS.

| Component | Description |
|-----------|-------------|
| [**Backend**](platform/docs/architecture/platform-architecture.md) | FastAPI API — template catalog, packaging engine, deployment orchestration, test runner |
| [**Frontend**](platform/control_plane/frontend/README.md) | React + TypeScript UI — browse use cases, deploy with one click, view logs, test agents |
| [**Infrastructure**](platform/control_plane/infrastructure/README.md) | Terraform modules — ECS, API Gateway, DynamoDB, S3, Cognito, CloudFront, CodeBuild |
| [**Templates**](platform/docs/templates/README.md) | 8 deployable starter templates — foundations, agent runtimes, and patterns |

### Starter Templates

| Template | Pattern | Description |
|----------|---------|-------------|
| Foundation Stack | Foundation | **Langfuse deployment** — provisions the Langfuse v3 observability server (plus required networking) that every other template and use case sends traces to. Deploy this first, once per account/region; accessible afterwards from the Observability tab. |
| Strands AgentCore | Managed Runtime | Strands agent on Bedrock AgentCore with Langfuse observability |
| LangGraph AgentCore | Managed Runtime | LangGraph agent on Bedrock AgentCore with Langfuse observability |
| Tool-Calling Agent | Single Agent | Agent with dynamic tool invocation, registration, and error handling |
| RAG Application | Retrieval | Retrieval-augmented generation with vector search and knowledge base |
| Multi-Agent Orchestration | Multi-Agent | Orchestrator pattern with specialized sub-agents collaborating on complex tasks |

### Deployment Paths

The Control Plane offers two ways to deploy any use case, backed by the same CodeBuild pipeline:

| Path | Best For | How It Works |
|------|----------|--------------|
| **Quick Deploy (S3)** | Business users, standard deployments | Backend packages the use case source from the template catalog into a ZIP, uploads to S3, and triggers Step Functions. No Git knowledge needed. |
| **Deploy from Git (CodeCommit)** | Developers, custom forks, team collaboration | User selects a pre-seeded CodeCommit repo from the UI. CodeBuild clones the repo and deploys. Push code to the repo to customize before deploying. |

Git-path repos are pre-seeded from the FSI Foundry registry by a one-time script (`scripts/seed-codecommit.sh init`). Users don't need to create repos manually.

[**Deploy the Control Plane &#8594;**](platform/docs/architecture/platform-architecture.md)

---

## Applications

### FSI Foundry

34 multi-agent POC implementations spanning 7 FSI domains — all built on one shared foundation of infrastructure and backend code.

- **Direct Amazon Bedrock AgentCore deployment** — simple and quick
- **Two framework implementations per use case** — LangGraph/LangChain and Strands Agents SDK
- **Shared foundations** — adapters, base classes, Terraform modules, Docker configs, agent registry
- **Per-use-case frontend UI** — Each use case has a dedicated React frontend deployed via CloudFront

<details>
<summary><strong>Banking (8)</strong></summary>

| Use Case | Agents |
|----------|--------|
| [KYC Risk Assessment](applications/fsi_foundry/use_cases/kyc_banking/README.md) | Credit Analyst, Compliance Officer |
| [Customer Service](applications/fsi_foundry/use_cases/customer_service/README.md) | Inquiry Handler, Transaction Specialist, Product Advisor |
| [Customer Chatbot](applications/fsi_foundry/use_cases/customer_chatbot/README.md) | Conversation Manager, Account Agent, Transaction Agent |
| [Customer Support](applications/fsi_foundry/use_cases/customer_support/README.md) | Ticket Classifier, Resolution Agent, Escalation Agent |
| [Document Search](applications/fsi_foundry/use_cases/document_search/README.md) | Document Indexer, Search Agent |
| [AI Assistant](applications/fsi_foundry/use_cases/ai_assistant/README.md) | Task Router, Data Lookup Agent, Report Generator |
| [Corporate Sales](applications/fsi_foundry/use_cases/corporate_sales/README.md) | Lead Scorer, Opportunity Analyst, Pitch Preparer |
| [Agentic Commerce](applications/fsi_foundry/use_cases/agentic_commerce/README.md) | Offer Engine, Fulfillment Agent, Product Matcher |

</details>

<details>
<summary><strong>Payments (3)</strong></summary>

| Use Case | Agents |
|----------|--------|
| [Agentic Payments](applications/fsi_foundry/use_cases/agentic_payments/README.md) | Payment Validator, Routing Agent, Reconciliation Agent |
| [Payment Operations](applications/fsi_foundry/use_cases/payment_operations/README.md) | Exception Handler, Settlement Agent |
| [Fraud Detection](applications/fsi_foundry/use_cases/fraud_detection/README.md) | Transaction Monitor, Pattern Analyst, Alert Generator |

</details>

<details>
<summary><strong>Risk & Compliance (5)</strong></summary>

| Use Case | Agents |
|----------|--------|
| [Document Processing](applications/fsi_foundry/use_cases/document_processing/README.md) | Document Classifier, Data Extractor, Validation Agent |
| [Credit Risk Assessment](applications/fsi_foundry/use_cases/credit_risk/README.md) | Financial Analyst, Risk Scorer, Portfolio Analyst |
| [Compliance Investigation](applications/fsi_foundry/use_cases/compliance_investigation/README.md) | Evidence Gatherer, Pattern Matcher, Regulatory Mapper |
| [Adverse Media Screening](applications/fsi_foundry/use_cases/adverse_media/README.md) | Media Screener, Sentiment Analyst, Risk Signal Extractor |
| [Market Surveillance](applications/fsi_foundry/use_cases/market_surveillance/README.md) | Trade Pattern Analyst, Communication Monitor, Alert Generator |

</details>

<details>
<summary><strong>Capital Markets (9)</strong></summary>

| Use Case | Agents |
|----------|--------|
| [Investment Advisory](applications/fsi_foundry/use_cases/investment_advisory/README.md) | Portfolio Analyst, Market Researcher, Client Profiler |
| [Earnings Summarization](applications/fsi_foundry/use_cases/earnings_summarization/README.md) | Transcript Processor, Metric Extractor, Sentiment Analyst |
| [Economic Research](applications/fsi_foundry/use_cases/economic_research/README.md) | Data Aggregator, Trend Analyst, Research Writer |
| [Email Triage](applications/fsi_foundry/use_cases/email_triage/README.md) | Email Classifier, Action Extractor |
| [Trading Assistant](applications/fsi_foundry/use_cases/trading_assistant/README.md) | Market Analyst, Trade Idea Generator, Execution Planner |
| [Research Credit Memo](applications/fsi_foundry/use_cases/research_credit_memo/README.md) | Data Gatherer, Credit Analyst, Memo Writer |
| [Investment Management](applications/fsi_foundry/use_cases/investment_management/README.md) | Allocation Optimizer, Rebalancing Agent, Performance Attributor |
| [Data Analytics](applications/fsi_foundry/use_cases/data_analytics/README.md) | Data Explorer, Statistical Analyst, Insight Generator |
| [Trading Insights](applications/fsi_foundry/use_cases/trading_insights/README.md) | Signal Generator, Cross Asset Analyst, Scenario Modeler |

</details>

<details>
<summary><strong>Insurance (3)</strong></summary>

| Use Case | Agents |
|----------|--------|
| [Customer Engagement](applications/fsi_foundry/use_cases/customer_engagement/README.md) | Churn Predictor, Outreach Agent, Policy Optimizer |
| [Claims Management](applications/fsi_foundry/use_cases/claims_management/README.md) | Claims Intake Agent, Damage Assessor, Settlement Recommender |
| [Life Insurance Agent](applications/fsi_foundry/use_cases/life_insurance_agent/README.md) | Needs Analyst, Product Matcher, Underwriting Assistant |

</details>

<details>
<summary><strong>Operations (3)</strong></summary>

| Use Case | Agents |
|----------|--------|
| [Call Center Analytics](applications/fsi_foundry/use_cases/call_center_analytics/README.md) | Call Monitor, Agent Performance Analyst, Operations Insight Generator |
| [Post Call Analytics](applications/fsi_foundry/use_cases/post_call_analytics/README.md) | Transcription Processor, Sentiment Analyst, Action Extractor |
| [Call Summarization](applications/fsi_foundry/use_cases/call_summarization/README.md) | Key Point Extractor, Summary Generator |

</details>

<details>
<summary><strong>Modernization (3)</strong></summary>

| Use Case | Agents |
|----------|--------|
| [Legacy Migration](applications/fsi_foundry/use_cases/legacy_migration/README.md) | Code Analyzer, Migration Planner, Conversion Agent |
| [Code Generation](applications/fsi_foundry/use_cases/code_generation/README.md) | Requirement Analyst, Code Scaffolder, Test Generator |
| [Mainframe Migration](applications/fsi_foundry/use_cases/mainframe_migration/README.md) | Mainframe Analyzer, Business Rule Extractor, Cloud Code Generator |

</details>

[**Explore FSI Foundry &#8594;**](applications/fsi_foundry/README.md)

### Reference Implementations

End-to-end full-stack solutions with dedicated frontends, backend APIs, and complete infrastructure.

| Implementation | Domain                | Description                                                                                                                                                                 |
|---------------|---------------|-------------------------------|
| [Market Surveillance](applications/reference_implementations/market-surveillance/README.md) | Capital Markets       | Real-time trade monitoring with 29 decision tree rules, multi-agent orchestration, and audit-ready reports                                                                  |
| [Shopping Concierge Agent](applications/reference_implementations/shopping-concierge-agent/README.md) | Agentic Payments      | AI-powered concierge with product search, cart management, payment support, and Cognito auth                                                                                |
| [Case Management](applications/reference_implementations/case-management/README.md) | Risk & Compliance     | Fraud detection and case management with pattern recognition (smurfing, mule accounts, high-velocity), conversational investigation, and optional AgentCore SAR generation  |
| [Agent Safety](applications/reference_implementations/agent-safety/README.md) | Safety & Governance   | Safety controls for Bedrock AgentCore — budget/eval/observability auto-provisioning, session interventions, kill switch, audit trail, and centralized dashboard             |

[**View Reference Implementations &#8594;**](applications/reference_implementations/README.md)

### App Factory

Describe your use case in plain language through a five-step wizard (problem, users, workflow, data, constraints). AI generates the Strands agent code and Terraform, and the CI/CD pipeline deploys it end-to-end to Bedrock AgentCore — no coding required. Track progress on the same deployment detail page as every other use case.

[**Try App Factory &#8594;**](applications/app_factory/README.md)

---

## Agent-as-a-Service

Managed autonomous agents you deploy into your own AWS account — either Amazon's Frontier Agents or your own Custom Agents built on Bedrock AgentCore.

### Frontier Agents

| Agent | Domain | Deployment | Status |
|-------|--------|------------|--------|
| [AWS DevOps Agent](https://docs.aws.amazon.com/devopsagent/latest/userguide/about-aws-devops-agent.html) | Incident Response & SRE | [Terraform](platform/control_plane/aaas/frontier_agents/devops/iac/terraform/README.md) &#124; [CDK](platform/control_plane/aaas/frontier_agents/devops/iac/cdk/README.md) &#124; [CloudFormation](platform/control_plane/aaas/frontier_agents/devops/iac/cloudformation/README.md) | Available |
| [AWS Security Agent](https://docs.aws.amazon.com/securityagent/latest/userguide/what-is.html) | Application Security | Terraform, CDK, CloudFormation | Coming Soon |
| [Kiro](https://kiro.dev) | Developer Productivity | Local IDE (not IaC-deployed) | Coming Soon |

One-click deployment from the Control Plane UI that provisions the agent space in your account. Monitor your build process and access Operator View post-deployment. 

[**Browse Frontier Agents &#8594;**](platform/control_plane/aaas/frontier_agents.json)

### Custom Agents (Coming Soon)

Build your own autonomous agent on Bedrock AgentCore — choose a model, attach tools, configure memory and guardrails, and deploy to a managed runtime.

### Tools Factory (Coming Soon)

Pre-built catalog of agent tools — MCP Gateway, Knowledge Base, Code Interpreter, Web Browser, Database Query, API Connector, Document Parser, and Notifications — plus a builder for custom tools from Lambda functions, REST APIs, or MCP servers. Tools are scoped per agent at deploy time and invoked automatically based on the agent's reasoning.

---

## Architecture

| Area | Document | Description |
|------|----------|-------------|
| **Platform** | [**Platform Architecture**](platform/docs/architecture/platform-architecture.md) | Full system design with Mermaid diagrams — frontend, backend, CI/CD pipeline, infrastructure modules, per-use-case UI deployment flow |
| **Platform** | [CI/CD Pipeline](platform/docs/architecture/cicd-pipeline.md) | Dual-source CodeBuild buildspec — Git clone / S3 unzip, Docker build, Terraform apply, UI build, S3 sync, CloudFront invalidation |
| **Platform** | [Infrastructure Scripts](platform/control_plane/infrastructure/scripts/README.md) | Reference for every shell and Python script used to deploy, tear down, and seed the Control Plane (deploy-full, deploy, destroy, import-existing, seed-codecommit) |
| **FSI Foundry** | [Architecture & Deployment](applications/fsi_foundry/docs/foundations/README.md) | [Architecture Patterns](applications/fsi_foundry/docs/foundations/architecture/architecture_patterns.md) &#124; [AgentCore Design](applications/fsi_foundry/docs/foundations/architecture/architecture_agentcore.md) &#124; [Deployment Guide](applications/fsi_foundry/docs/foundations/deployment/deployment_patterns.md) |
| **Reference** | [Market Surveillance](platform/docs/architecture/market-surveillance-architecture.md) | Multi-agent surveillance architecture — [Diagram](applications/reference_implementations/market-surveillance/docs/diagram/architecture.png) |
| **Reference** | [Shopping Concierge](applications/reference_implementations/shopping-concierge-agent/docs/AGENT_CAPABILITIES_SHOPPING.md) | [Agent Capabilities](applications/reference_implementations/shopping-concierge-agent/docs/AGENT_CAPABILITIES_SHOPPING.md) &#124; [Deployment](applications/reference_implementations/shopping-concierge-agent/docs/DEPLOYMENT.md) &#124; [Data Flow](applications/reference_implementations/shopping-concierge-agent/docs/shopping_data_flow.png) |
| **Reference** | [Case Management](applications/reference_implementations/case-management/README.md) | Fraud detection + investigation — [Architecture Diagram](applications/reference_implementations/case-management/architecture/architecture.drawio.png) |
| **Reference** | [Agent Safety](applications/reference_implementations/agent-safety/README.md) | Agent safety controls — [Signals Contract](applications/reference_implementations/agent-safety/SIGNALS_CONTRACT.md) |
| **AaaS** | AWS DevOps Agent | Same-account deploy of Amazon's managed DevOps Agent — Agent Space, operator role, primary-account association, optional sample Lambda for Part 2 cross-account monitoring. Available in three IaC flavors: [Terraform](platform/control_plane/aaas/frontier_agents/devops/iac/terraform/README.md) &#124; [CDK](platform/control_plane/aaas/frontier_agents/devops/iac/cdk/README.md) &#124; [CloudFormation](platform/control_plane/aaas/frontier_agents/devops/iac/cloudformation/README.md) |
| **AaaS** | [Frontier Agents Registry](platform/control_plane/aaas/frontier_agents.json) | Catalog entry that drives the deploy UI — agent metadata, supported IaC types, parameters |
| **Observability** | [Foundation Stack (Langfuse v3)](platform/docs/templates/foundation-stack.md) | Langfuse v3 + OpenTelemetry on ECS Fargate (bundled with required networking). Deploy once per account/region; every use case auto-provisions its own Langfuse project against this foundation. |
| **Evaluation** | Evaluation *(coming soon)* | Agent performance testing and quality benchmarks |

---

## Project Structure

```
ava/
│
├── plan/                                        # --- Strategy Layer ---
│   └── UseCaseGuidance.md                       # 8-step discovery framework for leaders
│
├── platform/                                    # --- Platform Layer ---
│   ├── docs/                                    # Architecture + template documentation
│   └── control_plane/
│       ├── frontend/                            # Control Plane Web UI (React 19 + TypeScript + Vite)
│       │   └── src/
│       │       ├── components/                  # React pages — Home, ApplicationsLanding,
│       │       │                                #   FSIFoundryCatalog, ReferenceImplementations,
│       │       │                                #   AppFactory, AaaSLanding, AwsAgentsCatalog,
│       │       │                                #   CustomAgentsCatalog, ToolsFactory,
│       │       │                                #   DeploymentDetail, TestDeploymentDrawer,
│       │       │                                #   TemplateCatalog, Observability, Guardrails
│       │       ├── api/                         # API client (Axios)
│       │       ├── auth/                        # Cognito authentication
│       │       ├── contexts/                    # React contexts (UserContext, AuthContext)
│       │       └── types/                       # TypeScript type definitions
│       │
│       ├── backend/                             # Control Plane API (FastAPI on ECS Fargate)
│       │   └── src/
│       │       ├── api/routes/                  # REST endpoints — deployments, templates,
│       │       │                                #   applications, codecommit, app_factory,
│       │       │                                #   frontier_agents, observability
│       │       ├── services/                    # Business logic (pipeline, packaging, deployment)
│       │       ├── models/                      # Pydantic models
│       │       └── core/                        # Config, auth, middleware
│       │
│       ├── infrastructure/                      # Terraform — Control Plane AWS Resources
│       │   ├── modules/
│       │   │   ├── ecs/                         # ECS Fargate cluster + service
│       │   │   ├── codebuild/                   # CI/CD pipeline (dual-source buildspec.yml)
│       │   │   ├── codecommit/                  # Pre-seeded repos for "Deploy from Git" path
│       │   │   ├── step_functions/              # Deployment orchestrator (source-agnostic)
│       │   │   ├── frontier_agents_pipeline/    # Dedicated Terraform-only pipeline for AaaS
│       │   │   ├── agent_registry/              # AgentCore agent registry metadata
│       │   │   ├── eventbridge/                 # Lifecycle events + Git push / PR-merge triggers
│       │   │   ├── cloudfront/                  # CDN for frontend
│       │   │   ├── cognito/                     # User pools + auth
│       │   │   ├── dynamodb/                    # Deployment state + App Factory submissions
│       │   │   ├── ecr/                         # Container registry
│       │   │   ├── s3/                          # Frontend hosting + artifact storage
│       │   │   ├── api_gateway/                 # HTTP API for backend
│       │   │   ├── networking/                  # VPC, subnets, security groups
│       │   │   ├── state_backend/               # Terraform remote state (S3 + DynamoDB lock)
│       │   │   └── observability/               # CloudWatch logs + alarms
│       │   └── scripts/                         # deploy-full.sh, deploy.sh, destroy.sh, seed-codecommit.sh
│       │
│       ├── templates/                           # 8 Starter Templates (deployed via UI)
│       │   ├── foundation-stack/                # Langfuse v3 + OpenTelemetry + required networking
│       │   ├── strands-agentcore/               # Strands on Bedrock AgentCore
│       │   ├── langraph-agentcore/              # LangGraph on Bedrock AgentCore
│       │   ├── tool-calling-agent/              # Single agent with tool invocation
│       │   ├── rag-application/                 # RAG with knowledge base
│       │   └── multi-agent-orchestration/       # Orchestrator pattern
│       │
│       └── aaas/                                # Agent-as-a-Service product domain
│           ├── frontier_agents.json             # Catalog registry (drives /aaas/aws-agents UI + deploy API)
│           └── frontier_agents/                 # Per-agent source trees
│               └── devops/iac/{terraform,cdk,cloudformation}/  # AWS DevOps Agent — Terraform + CDK + CloudFormation
│
├── applications/                                # --- Application Layer ---
│   │
│   ├── fsi_foundry/                             # FSI Foundry — 34 Multi-Agent Use Cases
│   │   ├── foundations/                         # Shared code used by ALL use cases
│   │   │   ├── src/                             # Python base classes and utilities
│   │   │   │   ├── base/                        # BaseAgent, BaseOrchestrator, BaseModel
│   │   │   │   ├── adapters/                    # Framework adapters (Strands, LangGraph)
│   │   │   │   ├── tools/                       # Shared agent tools
│   │   │   │   └── utils/                       # Logging, config, helpers
│   │   │   ├── iac/                             # Terraform modules for use case infra
│   │   │   │   ├── agentcore/                   # Bedrock AgentCore runtime + UI (S3, CloudFront, Lambda, API GW)
│   │   │   │   ├── shared/                      # Shared networking, IAM, ECR
│   │   │   │   └── cognito/                     # Per-use-case auth (optional)
│   │   │   └── docker/                          # Dockerfiles for agent containers
│   │   │
│   │   ├── use_cases/                           # 34 use case implementations
│   │   │   └── {use_case_name}/                 # e.g. kyc_banking, fraud_detection
│   │   │       └── src/
│   │   │           ├── strands/                 # Strands SDK implementation
│   │   │           │   ├── orchestrator.py      # Agent orchestration logic
│   │   │           │   ├── models.py            # Pydantic request/response models
│   │   │           │   └── agents/              # Individual agent definitions
│   │   │           └── langchain_langgraph/     # LangGraph implementation
│   │   │               ├── orchestrator.py
│   │   │               └── agents/
│   │   │
│   │   ├── ui/                                  # Per-use-case React frontends
│   │   │   └── {use_case_name}/                 # e.g. fraud_detection, agentic_payments
│   │   │       ├── src/components/              # AgentConsole, ResultsPanel, Home, Navigation
│   │   │       └── public/runtime-config.json   # API endpoint + input schema config
│   │   │
│   │   ├── data/
│   │   │   ├── registry/offerings.json          # Use case catalog (agents, fields, test entities)
│   │   │   └── samples/                         # Sample data for each use case
│   │   │
│   │   └── scripts/                             # Deployment and testing scripts
│   │       ├── main/deploy.sh                   # Interactive deployment wizard
│   │       ├── deploy/                          # Per-pattern deploy scripts
│   │       ├── use_cases/                       # Per-use-case test scripts
│   │       └── cleanup/                         # Resource teardown scripts
│   │
│   ├── reference_implementations/               # Full-Stack Reference Apps
│   │   ├── market-surveillance/                 # Capital Markets surveillance (Strands + Terraform)
│   │   │   ├── agent-backend/                   # Strands multi-agent backend
│   │   │   ├── trade-alerts-app/                # Next.js frontend
│   │   │   ├── infrastructure/                  # Terraform (multi-module)
│   │   │   └── seeding_scripts/                 # Data seeding and DB setup
│   │   │
│   │   ├── shopping-concierge-agent/            # Agentic payments concierge (Strands + MCP + CDK)
│   │   │   ├── concierge_agent/                 # Strands agent + MCP tools
│   │   │   ├── web-ui/                          # React frontend
│   │   │   ├── amplify/                         # Amplify backend (Cognito, AppSync, DynamoDB)
│   │   │   └── infrastructure/                  # CDK stacks (Agent, MCP, Frontend)
│   │   │
│   │   ├── case-management/                     # Fraud detection + investigation (Strands + Bash/CDK)
│   │   │   ├── agent/                           # Fraud Analyst + SAR Report agents
│   │   │   ├── frontend/                        # React case management UI
│   │   │   └── infrastructure/                  # DynamoDB, CloudFront + OAC, AgentCore SAR stack
│   │   │
│   │   └── agent-safety/                        # Human-in-the-loop safety toolkit
│   │       ├── cost-controls/                   # Auto budgets + anomaly alarms per agent
│   │       ├── hil-interventions/               # Kill switch (IAM deny) + per-session controls
│   │       └── dashboard/                       # Unified cost, eval, and observability signals
│   │
│   └── app_factory/                             # AI-generated use cases
│       ├── builder.py                           # Prompt → code generation logic
│       ├── prompts/                             # System prompts used by builder
│       ├── ui-template/                         # React UI scaffold for generated apps
│       ├── deploy.sh                            # CodeBuild entrypoint for generated bundles
│       └── scripts/                             # Supporting generation + packaging scripts
│                                                # Wizard → AI code + Terraform → deployed to AgentCore
│
```

---

## Getting Started

### Prerequisites

- AWS Account with [Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) (Claude models enabled)
- AWS CLI >= 2.28.9
- Terraform >= 1.0
- Python >= 3.11
- Node.js >= 22
- Docker with buildx support

### Quick Start

```bash
# Clone the repository
git clone https://github.com/aws-samples/ava
cd ava

# Copy environment config
cp .env.example .env
# Edit .env with your AWS credentials and region
```

**Choose your path:**

The Control Plane is the recommended entry point — once deployed, it can CI/CD-deploy every application including FSI Foundry use cases, reference implementations, templates, and app factory from its UI. The Foundry and reference implementation scripts remain available for standalone plug-and-play use if you'd rather skip the Control Plane.

**Recommended — deploy the Control Plane, then use its UI for everything:**

| Step                               | Command | Required? |
|------------------------------------|---------|-----------|
| 1. Deploy the Control Plane        | `cd platform/control_plane/infrastructure/scripts && ./deploy-full.sh` | Required |
| 2. Seed CodeCommit (enables the "Deploy from Git" path in the UI) | `cd platform/control_plane/infrastructure/scripts && ./seed-codecommit.sh init` | Optional — only for the Git deploy path |
| 3. Docker Hub (Authenticates to pull from Docker Hub) | `cd platform/control_plane/infrastructure/scripts && ./setup-dockerhub-auth.sh` | Optional — Only for LangFuse setup. [Instructions](platform/control_plane/infrastructure/scripts/README.md#setup-dockerhub-authsh) |

After step 1, user can the Control Plane UI to deploy any FSI Foundry use case or reference implementation — no further CLI work needed.

**Alternative — deploy standalone (without the Control Plane):**

| Goal | Command |
|------|---------|
| Deploy a single FSI Foundry use case from the CLI | `cd applications/fsi_foundry && ./scripts/main/deploy.sh` |
| Deploy a reference implementation from the CLI    | See [applications/reference_implementations/](applications/reference_implementations/README.md) |

> **⚠️ Model Access:** AWS accounts that have not used a legacy model in the last 30 days will receive an error when calling that model, resulting in **"Error: No Response"** in the frontends. Check the Model Catalog to select the right model.

[**Detailed Deployment Guide &#8594;**](applications/fsi_foundry/docs/foundations/deployment/)

---

## Documentation

### Platform

| Resource | Description |
|----------|-------------|
| [Control Plane](platform/docs/architecture/platform-architecture.md) | Deploy and manage agent applications from the web UI |
| [Infrastructure](platform/control_plane/infrastructure/README.md) | Terraform modules and deployment architecture |
| [Infrastructure Scripts](platform/control_plane/infrastructure/scripts/README.md) | `deploy-full.sh`, `deploy.sh`, `destroy.sh`, `import-existing.sh`, `seed-codecommit.sh` — usage, modes, troubleshooting |

### Applications

| Resource | Description |
|----------|-------------|
| [FSI Foundry](applications/fsi_foundry/README.md) | Architecture, foundations, and use case documentation |
| [Reference Implementations](applications/reference_implementations/README.md) | End-to-end full-stack solutions |
| [App Factory](applications/app_factory/README.md) | Natural-language wizard → AI-generated agent code + Terraform → deployed to AgentCore |
| [Deployment Guide](applications/fsi_foundry/docs/foundations/deployment/deployment_patterns.md) | Step-by-step deployment instructions |

### Agent-as-a-Service

| Resource | Description |
|----------|-------------|
| [Frontier Agents Registry](platform/control_plane/aaas/frontier_agents.json) | Catalog of managed AWS Frontier Agents — metadata, supported IaC flavors, deploy parameters |
| AWS DevOps Agent — IaC modules | Agent Space, operator role, primary-account association; optional Part 2 cross-account add-on. Choose your flavor: [Terraform](platform/control_plane/aaas/frontier_agents/devops/iac/terraform/README.md) &#124; [CDK](platform/control_plane/aaas/frontier_agents/devops/iac/cdk/README.md) &#124; [CloudFormation](platform/control_plane/aaas/frontier_agents/devops/iac/cloudformation/README.md) |
| [AWS DevOps Agent (AWS docs)](https://docs.aws.amazon.com/devopsagent/latest/userguide/about-aws-devops-agent.html) | Official service documentation — integrations, Agent Spaces, IAM, web app |
| [AWS Security Agent (AWS docs)](https://docs.aws.amazon.com/securityagent/latest/userguide/what-is.html) | Official service documentation — design review, code review, on-demand pentest |
| [Kiro](https://kiro.dev) | Amazon's agentic IDE — spec-driven development, steering files, hooks |

---

## Contributors

<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead><tr><th>Contributor</th><th>Contributions</th></tr></thead>
<tbody>
<tr><td><a href="https://www.linkedin.com/in/vivian-bui-413a561b6/">Vivian Bui</a></td><td>Control Plane platform, Frontier Agents, FSI Foundry foundations, 34 use case agentic design and service implementations, CI/CD pipeline, testing panel, deployment automation</td></tr>
<tr><td><a href="https://www.linkedin.com/in/ethanalmeida/">Ethan Almeida</a></td><td>App Factory, Strands AgentCore integration, deployment scripts</td></tr>
<tr><td><a href="https://www.linkedin.com/in/adarshparakh/">Adarsh Parakh</a></td><td>FSI Foundry 34 frontend UIs, guidance design, workflow-driven orchestration pattern, Guardrails &amp; Policy (coming soon)</td></tr>
<tr><td><a href="https://www.linkedin.com/in/daniela-vargas-msda/">Daniela Vargas</a></td><td>Langfuse observability, Shopping Concierge Agent reference implementation</td></tr>
<tr><td>
&#8226; <a href="https://www.linkedin.com/in/prasanthponnoth/">Prasanth Ponnoth</a><br/>
&#8226; <a href="https://www.linkedin.com/in/milanbavadiya/">Milan Bavadiya</a><br/>
&#8226; <a href="https://www.linkedin.com/in/rhia-bipin-roy-b306ba191/">Rhia Bipin Roy</a><br/>
&#8226; <a href="https://www.linkedin.com/in/soniamahankali/">Sonia Mahankali</a>
</td><td>Agent Safety reference implementation</td></tr>
<tr><td>
&#8226; <a href="https://www.linkedin.com/in/dialloalseny/">Alseny Diallo</a><br/>
&#8226; <a href="https://www.linkedin.com/in/mark-paguay-5a06a6193/">Mark Paguay</a>
</td><td>Market Surveillance reference implementation</td></tr>
<tr><td><a href="https://www.linkedin.com/in/hemal-gadhiya/">Hemal Gadhiya</a></td><td>App Templates, Role-based access control (coming soon)</td></tr>
<tr><td><a href="https://www.linkedin.com/in/sudhir-kalidindi-669a732/">Sudhir Kalidindi</a></td><td>Case Management reference implementation</td></tr>
</tbody>
</table>

## Contacts

| Role                                   | Name                                                            |
|----------------------------------------|-----------------------------------------------------------------|
| Product & Strategy Lead                | [Bikash Behera](https://www.linkedin.com/in/bikash-behera/)     |
| Platform Architect                     | [Jorge Castans](https://www.linkedin.com/in/jorgecastans/)      |
| Project Lead                           | [Vivian Bui](https://www.linkedin.com/in/vivian-bui-413a561b6/) |

---

## Security

See [SECURITY.md](SECURITY.md) for reporting security issues.

## License

This project is licensed under the Apache License 2.0 — see [LICENSE](LICENSE) for details.

---

<div align="center">
<sub>Made with ❤️ by the FSI PACE Prototyping Team at AWS</sub>
</div>
