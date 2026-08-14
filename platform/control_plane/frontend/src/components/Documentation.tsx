import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import kycAssessmentFlow from '../assets/diagrams/kyc-assessment-flow.svg?raw';
import kycStateMachine from '../assets/diagrams/kyc-state-machine.svg?raw';
import kycDeploymentPipeline from '../assets/diagrams/kyc-deployment-pipeline.svg?raw';

// Banking SVG imports
import customerServiceAssessmentFlow from '../assets/diagrams/customer-service-assessment-flow.svg?raw';
import customerServiceStateMachine from '../assets/diagrams/customer-service-state-machine.svg?raw';
import customerServiceDeploymentPipeline from '../assets/diagrams/customer-service-deployment-pipeline.svg?raw';
import documentSearchAssessmentFlow from '../assets/diagrams/document-search-assessment-flow.svg?raw';
import documentSearchStateMachine from '../assets/diagrams/document-search-state-machine.svg?raw';
import documentSearchDeploymentPipeline from '../assets/diagrams/document-search-deployment-pipeline.svg?raw';
import agenticPaymentsAssessmentFlow from '../assets/diagrams/agentic-payments-assessment-flow.svg?raw';
import agenticPaymentsStateMachine from '../assets/diagrams/agentic-payments-state-machine.svg?raw';
import agenticPaymentsDeploymentPipeline from '../assets/diagrams/agentic-payments-deployment-pipeline.svg?raw';
import paymentOperationsAssessmentFlow from '../assets/diagrams/payment-operations-assessment-flow.svg?raw';
import paymentOperationsStateMachine from '../assets/diagrams/payment-operations-state-machine.svg?raw';
import paymentOperationsDeploymentPipeline from '../assets/diagrams/payment-operations-deployment-pipeline.svg?raw';
import customerChatbotAssessmentFlow from '../assets/diagrams/customer-chatbot-assessment-flow.svg?raw';
import customerChatbotStateMachine from '../assets/diagrams/customer-chatbot-state-machine.svg?raw';
import customerChatbotDeploymentPipeline from '../assets/diagrams/customer-chatbot-deployment-pipeline.svg?raw';
import customerSupportAssessmentFlow from '../assets/diagrams/customer-support-assessment-flow.svg?raw';
import customerSupportStateMachine from '../assets/diagrams/customer-support-state-machine.svg?raw';
import customerSupportDeploymentPipeline from '../assets/diagrams/customer-support-deployment-pipeline.svg?raw';
import aiAssistantAssessmentFlow from '../assets/diagrams/ai-assistant-assessment-flow.svg?raw';
import aiAssistantStateMachine from '../assets/diagrams/ai-assistant-state-machine.svg?raw';
import aiAssistantDeploymentPipeline from '../assets/diagrams/ai-assistant-deployment-pipeline.svg?raw';
import corporateSalesAssessmentFlow from '../assets/diagrams/corporate-sales-assessment-flow.svg?raw';
import corporateSalesStateMachine from '../assets/diagrams/corporate-sales-state-machine.svg?raw';
import corporateSalesDeploymentPipeline from '../assets/diagrams/corporate-sales-deployment-pipeline.svg?raw';
import agenticCommerceAssessmentFlow from '../assets/diagrams/agentic-commerce-assessment-flow.svg?raw';
import agenticCommerceStateMachine from '../assets/diagrams/agentic-commerce-state-machine.svg?raw';
import agenticCommerceDeploymentPipeline from '../assets/diagrams/agentic-commerce-deployment-pipeline.svg?raw';

// Risk & Compliance SVG imports
import fraudDetectionAssessmentFlow from '../assets/diagrams/fraud-detection-assessment-flow.svg?raw';
import fraudDetectionStateMachine from '../assets/diagrams/fraud-detection-state-machine.svg?raw';
import fraudDetectionDeploymentPipeline from '../assets/diagrams/fraud-detection-deployment-pipeline.svg?raw';
import documentProcessingAssessmentFlow from '../assets/diagrams/document-processing-assessment-flow.svg?raw';
import documentProcessingStateMachine from '../assets/diagrams/document-processing-state-machine.svg?raw';
import documentProcessingDeploymentPipeline from '../assets/diagrams/document-processing-deployment-pipeline.svg?raw';
import creditRiskAssessmentFlow from '../assets/diagrams/credit-risk-assessment-flow.svg?raw';
import creditRiskStateMachine from '../assets/diagrams/credit-risk-state-machine.svg?raw';
import creditRiskDeploymentPipeline from '../assets/diagrams/credit-risk-deployment-pipeline.svg?raw';
import complianceInvestigationAssessmentFlow from '../assets/diagrams/compliance-investigation-assessment-flow.svg?raw';
import complianceInvestigationStateMachine from '../assets/diagrams/compliance-investigation-state-machine.svg?raw';
import complianceInvestigationDeploymentPipeline from '../assets/diagrams/compliance-investigation-deployment-pipeline.svg?raw';
import adverseMediaAssessmentFlow from '../assets/diagrams/adverse-media-assessment-flow.svg?raw';
import adverseMediaStateMachine from '../assets/diagrams/adverse-media-state-machine.svg?raw';
import adverseMediaDeploymentPipeline from '../assets/diagrams/adverse-media-deployment-pipeline.svg?raw';
import marketSurveillanceAssessmentFlow from '../assets/diagrams/market-surveillance-assessment-flow.svg?raw';
import marketSurveillanceStateMachine from '../assets/diagrams/market-surveillance-state-machine.svg?raw';
import marketSurveillanceDeploymentPipeline from '../assets/diagrams/market-surveillance-deployment-pipeline.svg?raw';

// Capital Markets SVG imports
import investmentAdvisoryAssessmentFlow from '../assets/diagrams/investment-advisory-assessment-flow.svg?raw';
import investmentAdvisoryStateMachine from '../assets/diagrams/investment-advisory-state-machine.svg?raw';
import investmentAdvisoryDeploymentPipeline from '../assets/diagrams/investment-advisory-deployment-pipeline.svg?raw';
import earningsSummarizationAssessmentFlow from '../assets/diagrams/earnings-summarization-assessment-flow.svg?raw';
import earningsSummarizationStateMachine from '../assets/diagrams/earnings-summarization-state-machine.svg?raw';
import earningsSummarizationDeploymentPipeline from '../assets/diagrams/earnings-summarization-deployment-pipeline.svg?raw';
import economicResearchAssessmentFlow from '../assets/diagrams/economic-research-assessment-flow.svg?raw';
import economicResearchStateMachine from '../assets/diagrams/economic-research-state-machine.svg?raw';
import economicResearchDeploymentPipeline from '../assets/diagrams/economic-research-deployment-pipeline.svg?raw';
import emailTriageAssessmentFlow from '../assets/diagrams/email-triage-assessment-flow.svg?raw';
import emailTriageStateMachine from '../assets/diagrams/email-triage-state-machine.svg?raw';
import emailTriageDeploymentPipeline from '../assets/diagrams/email-triage-deployment-pipeline.svg?raw';
import tradingAssistantAssessmentFlow from '../assets/diagrams/trading-assistant-assessment-flow.svg?raw';
import tradingAssistantStateMachine from '../assets/diagrams/trading-assistant-state-machine.svg?raw';
import tradingAssistantDeploymentPipeline from '../assets/diagrams/trading-assistant-deployment-pipeline.svg?raw';
import researchCreditMemoAssessmentFlow from '../assets/diagrams/research-credit-memo-assessment-flow.svg?raw';
import researchCreditMemoStateMachine from '../assets/diagrams/research-credit-memo-state-machine.svg?raw';
import researchCreditMemoDeploymentPipeline from '../assets/diagrams/research-credit-memo-deployment-pipeline.svg?raw';
import investmentManagementAssessmentFlow from '../assets/diagrams/investment-management-assessment-flow.svg?raw';
import investmentManagementStateMachine from '../assets/diagrams/investment-management-state-machine.svg?raw';
import investmentManagementDeploymentPipeline from '../assets/diagrams/investment-management-deployment-pipeline.svg?raw';
import dataAnalyticsAssessmentFlow from '../assets/diagrams/data-analytics-assessment-flow.svg?raw';
import dataAnalyticsStateMachine from '../assets/diagrams/data-analytics-state-machine.svg?raw';
import dataAnalyticsDeploymentPipeline from '../assets/diagrams/data-analytics-deployment-pipeline.svg?raw';
import tradingInsightsAssessmentFlow from '../assets/diagrams/trading-insights-assessment-flow.svg?raw';
import tradingInsightsStateMachine from '../assets/diagrams/trading-insights-state-machine.svg?raw';
import tradingInsightsDeploymentPipeline from '../assets/diagrams/trading-insights-deployment-pipeline.svg?raw';

// Insurance SVG imports
import claimsManagementAssessmentFlow from '../assets/diagrams/claims-management-assessment-flow.svg?raw';
import claimsManagementStateMachine from '../assets/diagrams/claims-management-state-machine.svg?raw';
import claimsManagementDeploymentPipeline from '../assets/diagrams/claims-management-deployment-pipeline.svg?raw';
import lifeInsuranceAgentAssessmentFlow from '../assets/diagrams/life-insurance-agent-assessment-flow.svg?raw';
import lifeInsuranceAgentStateMachine from '../assets/diagrams/life-insurance-agent-state-machine.svg?raw';
import lifeInsuranceAgentDeploymentPipeline from '../assets/diagrams/life-insurance-agent-deployment-pipeline.svg?raw';
import customerEngagementAssessmentFlow from '../assets/diagrams/customer-engagement-assessment-flow.svg?raw';
import customerEngagementStateMachine from '../assets/diagrams/customer-engagement-state-machine.svg?raw';
import customerEngagementDeploymentPipeline from '../assets/diagrams/customer-engagement-deployment-pipeline.svg?raw';

// Operations SVG imports
import callCenterAnalyticsAssessmentFlow from '../assets/diagrams/call-center-analytics-assessment-flow.svg?raw';
import callCenterAnalyticsStateMachine from '../assets/diagrams/call-center-analytics-state-machine.svg?raw';
import callCenterAnalyticsDeploymentPipeline from '../assets/diagrams/call-center-analytics-deployment-pipeline.svg?raw';
import postCallAnalyticsAssessmentFlow from '../assets/diagrams/post-call-analytics-assessment-flow.svg?raw';
import postCallAnalyticsStateMachine from '../assets/diagrams/post-call-analytics-state-machine.svg?raw';
import postCallAnalyticsDeploymentPipeline from '../assets/diagrams/post-call-analytics-deployment-pipeline.svg?raw';
import callSummarizationAssessmentFlow from '../assets/diagrams/call-summarization-assessment-flow.svg?raw';
import callSummarizationStateMachine from '../assets/diagrams/call-summarization-state-machine.svg?raw';
import callSummarizationDeploymentPipeline from '../assets/diagrams/call-summarization-deployment-pipeline.svg?raw';

// Modernization SVG imports
import legacyMigrationAssessmentFlow from '../assets/diagrams/legacy-migration-assessment-flow.svg?raw';
import legacyMigrationStateMachine from '../assets/diagrams/legacy-migration-state-machine.svg?raw';
import legacyMigrationDeploymentPipeline from '../assets/diagrams/legacy-migration-deployment-pipeline.svg?raw';
import codeGenerationAssessmentFlow from '../assets/diagrams/code-generation-assessment-flow.svg?raw';
import codeGenerationStateMachine from '../assets/diagrams/code-generation-state-machine.svg?raw';
import codeGenerationDeploymentPipeline from '../assets/diagrams/code-generation-deployment-pipeline.svg?raw';
import mainframeMigrationAssessmentFlow from '../assets/diagrams/mainframe-migration-assessment-flow.svg?raw';
import mainframeMigrationStateMachine from '../assets/diagrams/mainframe-migration-state-machine.svg?raw';
import mainframeMigrationDeploymentPipeline from '../assets/diagrams/mainframe-migration-deployment-pipeline.svg?raw';

interface DocSection {
  id: string;
  title: string;
  children?: DocSection[];
  content?: string;
}

// Map of diagram names to pre-rendered SVGs
const diagrams: Record<string, string> = {
  // KYC Banking (existing)
  'kyc-assessment-flow': kycAssessmentFlow,
  'kyc-state-machine': kycStateMachine,
  'kyc-deployment-pipeline': kycDeploymentPipeline,
  // Banking
  'customer-service-assessment-flow': customerServiceAssessmentFlow,
  'customer-service-state-machine': customerServiceStateMachine,
  'customer-service-deployment-pipeline': customerServiceDeploymentPipeline,
  'document-search-assessment-flow': documentSearchAssessmentFlow,
  'document-search-state-machine': documentSearchStateMachine,
  'document-search-deployment-pipeline': documentSearchDeploymentPipeline,
  'agentic-payments-assessment-flow': agenticPaymentsAssessmentFlow,
  'agentic-payments-state-machine': agenticPaymentsStateMachine,
  'agentic-payments-deployment-pipeline': agenticPaymentsDeploymentPipeline,
  'payment-operations-assessment-flow': paymentOperationsAssessmentFlow,
  'payment-operations-state-machine': paymentOperationsStateMachine,
  'payment-operations-deployment-pipeline': paymentOperationsDeploymentPipeline,
  'customer-chatbot-assessment-flow': customerChatbotAssessmentFlow,
  'customer-chatbot-state-machine': customerChatbotStateMachine,
  'customer-chatbot-deployment-pipeline': customerChatbotDeploymentPipeline,
  'customer-support-assessment-flow': customerSupportAssessmentFlow,
  'customer-support-state-machine': customerSupportStateMachine,
  'customer-support-deployment-pipeline': customerSupportDeploymentPipeline,
  'ai-assistant-assessment-flow': aiAssistantAssessmentFlow,
  'ai-assistant-state-machine': aiAssistantStateMachine,
  'ai-assistant-deployment-pipeline': aiAssistantDeploymentPipeline,
  'corporate-sales-assessment-flow': corporateSalesAssessmentFlow,
  'corporate-sales-state-machine': corporateSalesStateMachine,
  'corporate-sales-deployment-pipeline': corporateSalesDeploymentPipeline,
  'agentic-commerce-assessment-flow': agenticCommerceAssessmentFlow,
  'agentic-commerce-state-machine': agenticCommerceStateMachine,
  'agentic-commerce-deployment-pipeline': agenticCommerceDeploymentPipeline,
  // Risk & Compliance
  'fraud-detection-assessment-flow': fraudDetectionAssessmentFlow,
  'fraud-detection-state-machine': fraudDetectionStateMachine,
  'fraud-detection-deployment-pipeline': fraudDetectionDeploymentPipeline,
  'document-processing-assessment-flow': documentProcessingAssessmentFlow,
  'document-processing-state-machine': documentProcessingStateMachine,
  'document-processing-deployment-pipeline': documentProcessingDeploymentPipeline,
  'credit-risk-assessment-flow': creditRiskAssessmentFlow,
  'credit-risk-state-machine': creditRiskStateMachine,
  'credit-risk-deployment-pipeline': creditRiskDeploymentPipeline,
  'compliance-investigation-assessment-flow': complianceInvestigationAssessmentFlow,
  'compliance-investigation-state-machine': complianceInvestigationStateMachine,
  'compliance-investigation-deployment-pipeline': complianceInvestigationDeploymentPipeline,
  'adverse-media-assessment-flow': adverseMediaAssessmentFlow,
  'adverse-media-state-machine': adverseMediaStateMachine,
  'adverse-media-deployment-pipeline': adverseMediaDeploymentPipeline,
  'market-surveillance-assessment-flow': marketSurveillanceAssessmentFlow,
  'market-surveillance-state-machine': marketSurveillanceStateMachine,
  'market-surveillance-deployment-pipeline': marketSurveillanceDeploymentPipeline,
  // Capital Markets
  'investment-advisory-assessment-flow': investmentAdvisoryAssessmentFlow,
  'investment-advisory-state-machine': investmentAdvisoryStateMachine,
  'investment-advisory-deployment-pipeline': investmentAdvisoryDeploymentPipeline,
  'earnings-summarization-assessment-flow': earningsSummarizationAssessmentFlow,
  'earnings-summarization-state-machine': earningsSummarizationStateMachine,
  'earnings-summarization-deployment-pipeline': earningsSummarizationDeploymentPipeline,
  'economic-research-assessment-flow': economicResearchAssessmentFlow,
  'economic-research-state-machine': economicResearchStateMachine,
  'economic-research-deployment-pipeline': economicResearchDeploymentPipeline,
  'email-triage-assessment-flow': emailTriageAssessmentFlow,
  'email-triage-state-machine': emailTriageStateMachine,
  'email-triage-deployment-pipeline': emailTriageDeploymentPipeline,
  'trading-assistant-assessment-flow': tradingAssistantAssessmentFlow,
  'trading-assistant-state-machine': tradingAssistantStateMachine,
  'trading-assistant-deployment-pipeline': tradingAssistantDeploymentPipeline,
  'research-credit-memo-assessment-flow': researchCreditMemoAssessmentFlow,
  'research-credit-memo-state-machine': researchCreditMemoStateMachine,
  'research-credit-memo-deployment-pipeline': researchCreditMemoDeploymentPipeline,
  'investment-management-assessment-flow': investmentManagementAssessmentFlow,
  'investment-management-state-machine': investmentManagementStateMachine,
  'investment-management-deployment-pipeline': investmentManagementDeploymentPipeline,
  'data-analytics-assessment-flow': dataAnalyticsAssessmentFlow,
  'data-analytics-state-machine': dataAnalyticsStateMachine,
  'data-analytics-deployment-pipeline': dataAnalyticsDeploymentPipeline,
  'trading-insights-assessment-flow': tradingInsightsAssessmentFlow,
  'trading-insights-state-machine': tradingInsightsStateMachine,
  'trading-insights-deployment-pipeline': tradingInsightsDeploymentPipeline,
  // Insurance
  'claims-management-assessment-flow': claimsManagementAssessmentFlow,
  'claims-management-state-machine': claimsManagementStateMachine,
  'claims-management-deployment-pipeline': claimsManagementDeploymentPipeline,
  'life-insurance-agent-assessment-flow': lifeInsuranceAgentAssessmentFlow,
  'life-insurance-agent-state-machine': lifeInsuranceAgentStateMachine,
  'life-insurance-agent-deployment-pipeline': lifeInsuranceAgentDeploymentPipeline,
  'customer-engagement-assessment-flow': customerEngagementAssessmentFlow,
  'customer-engagement-state-machine': customerEngagementStateMachine,
  'customer-engagement-deployment-pipeline': customerEngagementDeploymentPipeline,
  // Operations
  'call-center-analytics-assessment-flow': callCenterAnalyticsAssessmentFlow,
  'call-center-analytics-state-machine': callCenterAnalyticsStateMachine,
  'call-center-analytics-deployment-pipeline': callCenterAnalyticsDeploymentPipeline,
  'post-call-analytics-assessment-flow': postCallAnalyticsAssessmentFlow,
  'post-call-analytics-state-machine': postCallAnalyticsStateMachine,
  'post-call-analytics-deployment-pipeline': postCallAnalyticsDeploymentPipeline,
  'call-summarization-assessment-flow': callSummarizationAssessmentFlow,
  'call-summarization-state-machine': callSummarizationStateMachine,
  'call-summarization-deployment-pipeline': callSummarizationDeploymentPipeline,
  // Modernization
  'legacy-migration-assessment-flow': legacyMigrationAssessmentFlow,
  'legacy-migration-state-machine': legacyMigrationStateMachine,
  'legacy-migration-deployment-pipeline': legacyMigrationDeploymentPipeline,
  'code-generation-assessment-flow': codeGenerationAssessmentFlow,
  'code-generation-state-machine': codeGenerationStateMachine,
  'code-generation-deployment-pipeline': codeGenerationDeploymentPipeline,
  'mainframe-migration-assessment-flow': mainframeMigrationAssessmentFlow,
  'mainframe-migration-state-machine': mainframeMigrationStateMachine,
  'mainframe-migration-deployment-pipeline': mainframeMigrationDeploymentPipeline,
};

const docs: DocSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    children: [
      {
        id: 'overview',
        title: 'Overview',
        content: `# Agentic Value Accelerator

The Agentic Value Accelerator (AVA) is a full-lifecycle control plane for deploying, securing, and governing AI agent applications for financial services on AWS.

## Platform Sections

| Section | Purpose | Route |
|---|---|---|
| **Plan** | Maturity assessment, operating model, use-case prioritization, and business case tooling | \`/plan\` |
| **Applications** | FSI Foundry catalog, App Factory wizard, Reference Implementations, and template downloads | \`/applications\` |
| **AaaS — Frontier Agents** | One-click deployment of AWS-managed agents (DevOps Agent, Security Agent) | \`/aaas\` |
| **Capabilities** | Knowledge sources (Data Lake, Knowledge Base, MCP servers), Tools, and Prompts | \`/capabilities\` |
| **Secure** | Guardrails (content-level safety) and AgentCore Policy (resource-level access control) | \`/secure\` |
| **Observability** | Langfuse (self-hosted, deep LLM tracing) and AgentCore Observability (X-Ray + CloudWatch) | \`/observability\` |
| **Govern** | Command Center, Trust Stack, Risk Management, Data Governance, Compliance Center, Fleet, FinOps, Audit | \`/govern\` |

## Role-Based Access Control

The platform enforces three roles via Cognito groups:

| Role | Capabilities |
|---|---|
| **admin** | Full access — deploy, configure, manage users |
| **operator** | Deploy applications, manage guardrails and policies |
| **viewer** | Read-only — browse catalog; Deploy buttons visible but return 403 with inline message |

## Architecture

**Control Plane Components:**
- **Frontend**: React + TypeScript UI served via CloudFront
- **Backend**: FastAPI on ECS Fargate with DynamoDB and S3
- **Infrastructure**: Terraform modules managing all AWS resources
- **Deployment Pipeline**: Step Functions orchestration with CodeBuild execution

**Application Layer:**
- **FSI Foundry**: 25+ use cases across 7 domains, dual framework (Strands + LangGraph)
- **App Factory**: AI-driven 5-step wizard that generates agent code + Terraform and auto-deploys to AgentCore
- **Reference Implementations**: Deep full-stack solutions (Market Surveillance, Shopping Concierge, Case Management, Agent Safety Controls)
- **Templates**: Infrastructure modules, code libraries, and starter applications`,
      },
      {
        id: 'quickstart',
        title: 'Quick Start',
        content: `# Quick Start

## Prerequisites

- AWS Account with Amazon Bedrock enabled (Claude models)
- AWS CLI >= 2.28.9 with configured credentials
- Terraform >= 1.5.0
- Docker with buildx
- Node.js >= 18
- Python >= 3.9
- **X-Ray Transaction Search enabled** in your target account — required for AgentCore Observability. Enable it once via the X-Ray console or with \`aws xray put-encryption-config\`.

## One-Command Deploy

The fastest path is the full-stack deploy script, which handles all 7 steps automatically:

\`\`\`bash
cd platform/control_plane
cp infrastructure/terraform.tfvars.example infrastructure/terraform.tfvars
# Edit terraform.tfvars — set your AWS region, account ID, and Cognito settings

./deploy-full.sh
\`\`\`

The script runs these steps in order:
1. **Terraform** — provisions VPC, ECS, DynamoDB, S3, Cognito, CloudFront
2. **Backend Docker** — builds and pushes the FastAPI image to ECR, forces ECS redeployment
3. **MCP servers** — builds and registers AgentCore MCP Gateway endpoints
4. **KB MCP** — sets up Knowledge Base MCP server for Capabilities
5. **Frontend** — \`npm run build\` + S3 sync + CloudFront invalidation
6. **Cognito users** — creates default admin/operator/viewer accounts from \`terraform.tfvars\`
7. **Health check** — verifies API and CloudFront are responding

## Manual Steps (if needed)

\`\`\`bash
# 1. Infrastructure
cd infrastructure
terraform init && terraform apply

# 2. Backend
docker buildx build --platform linux/amd64 -f ../backend/Dockerfile -t <ECR_URL>:latest --push ..
aws ecs update-service --cluster <CLUSTER> --service <SERVICE> --force-new-deployment

# 3. Frontend
cd ../frontend
echo "VITE_API_URL=<API_ENDPOINT>" > .env.production
npm install && npm run build
aws s3 sync dist/ s3://<FRONTEND_BUCKET>/ --delete
aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths "/*"
\`\`\`

## Access the Platform

Navigate to the CloudFront URL and sign in with one of the seeded Cognito accounts. You can now:
- **Plan** — run a maturity assessment and prioritize use cases
- **Applications** — browse FSI Foundry, deploy via pipeline, or use App Factory
- **Secure** — configure guardrails and access policies
- **Govern** — monitor risk, compliance, and cost
- **Observability** — enable Langfuse tracing or AgentCore X-Ray observability`,
      },
    ],
  },
  {
    id: 'plan',
    title: 'Plan',
    children: [
      {
        id: 'plan-overview',
        title: 'Overview',
        content: `# Plan

The **Plan** section helps teams structure their AI adoption journey before touching infrastructure. It surfaces four tools that take you from current-state assessment through business case approval.

Navigate to \`/plan\` to reach the Plan landing page, which links to each tool.

## Tools

| Tool | Route | Purpose |
|---|---|---|
| Maturity Assessment | \`/maturity-assessment\` | Score your organization's AI readiness across 6 dimensions |
| Use Case Prioritization | \`/use-cases\` | Rank candidate use cases by value, feasibility, and risk |
| Operating Model | \`/operating-model\` | Define roles, governance structure, and center-of-excellence patterns |
| Business Cases | \`/business-cases\` | Build ROI models and exec-ready business case documents |

These tools are independent — teams can use any or all of them in any order.`,
      },
      {
        id: 'plan-maturity',
        title: 'Maturity Assessment',
        content: `# Maturity Assessment

Navigate to \`/maturity-assessment\`.

The Maturity Assessment scores your organization across six readiness dimensions: **Data**, **Technology**, **Talent**, **Process**, **Governance**, and **Culture**. Each dimension is rated 1–5 based on your responses to a structured questionnaire.

## What It Produces

- A radar chart showing your current maturity profile
- A gap analysis identifying the dimensions most limiting your AI adoption
- A recommended sequencing of investments to move toward Level 4–5 across all dimensions
- An exportable PDF summary suitable for executive or board presentations

## How to Use It

1. Open **Plan → Maturity Assessment**
2. Answer the questionnaire for each dimension (takes ~15 minutes)
3. Review your radar chart and gap analysis
4. Use the recommended investment sequence to inform your roadmap`,
      },
      {
        id: 'plan-operating-model',
        title: 'Operating Model',
        content: `# Operating Model

Navigate to \`/operating-model\`.

The Operating Model tool helps teams define how AI agent development and governance will be organized. It covers three patterns — **Centralized (CoE)**, **Federated**, and **Hybrid** — and walks through the key decisions for each:

- Who owns agent development vs. platform engineering vs. risk/compliance oversight
- How to structure a Center of Excellence (CoE) for reuse and knowledge sharing
- RACI matrix for agent lifecycle events (build, deploy, monitor, retire)
- Integration touch points with existing IT governance and change management processes

## Output

The tool produces a draft operating model document you can download and adapt to your organizational context.`,
      },
      {
        id: 'plan-prioritization',
        title: 'Use Case Prioritization',
        content: `# Use Case Prioritization

Navigate to \`/use-cases\`.

The Use Case Prioritization tool helps teams evaluate and rank candidate agent use cases before committing engineering resources. Each use case is scored on:

- **Business Value** — estimated ROI, cost reduction, or revenue impact
- **Implementation Feasibility** — data availability, technical complexity, time to value
- **Risk Level** — regulatory exposure, model reliability requirements, human-in-the-loop needs

## Workflow

1. Enter candidate use cases (or import from the FSI Foundry catalog)
2. Score each across the three dimensions
3. Review the prioritization matrix — high-value, low-risk use cases surface to the top
4. Export the ranked list for stakeholder alignment

The tool integrates with the FSI Foundry catalog so you can link a prioritized use case directly to an existing implementation.`,
      },
      {
        id: 'plan-business-cases',
        title: 'Business Cases',
        content: `# Business Cases

Navigate to \`/business-cases\`.

The Business Cases tool generates structured ROI models and narrative business case documents for individual AI agent initiatives. It captures:

- **Problem Statement** — current-state cost, error rate, or cycle time
- **Proposed Solution** — agent capabilities and expected automation rate
- **Financial Model** — one-time build cost, ongoing run cost, and projected savings or revenue lift over 3 years
- **Risk & Compliance** — key risks and mitigations for the use case

## Output

The tool produces a downloadable business case document in a format suitable for investment committee or budget approval workflows. Each business case links back to the Use Case Prioritization score so reviewers can see how the case ranked against alternatives.`,
      },
      {
        id: 'plan-organization-design',
        title: 'Organization Design',
        content: `# Organization Design

Navigate to \`/organization-design\`.

Once you have picked an Operating Model, Organization Design turns that pattern into a concrete plan for the team that will actually deliver — so Plan hands Build a team, not just a strategy.

## What it produces

- **Org Chart** — roles and squads derived from the chosen TOM (Centralized CoE / Hub-and-Spoke / Federated)
- **Reporting Lines** — who each squad rolls up into and where accountability sits
- **RACI Matrix** — Responsibility / Accountability / Consulted / Informed across Build, Secure, Operate, and Govern activities
- **Headcount Ramp** — hiring priorities and expected FTE growth quarter-by-quarter
- **Skills & Roles** — the seniority mix, capability profiles, and internal-vs-hire recommendations for each role

The design persists to DynamoDB and can be exported as a shareable document for HR or leadership review.`,
      },
    ],
  },
  {
    id: 'fsi-foundry',
    title: 'FSI Foundry',
    children: [
      {
        id: 'foundry-overview',
        title: 'Overview',
        content: `# FSI Foundry

FSI Foundry provides **25+ multi-agent applications** across 7 financial services domains. Each use case has implementations in both Strands and LangGraph frameworks.

## What You Get

- **50+ Total Implementations**: 25+ use cases × 2 frameworks (Strands + LangGraph)
- **Multi-Agent Orchestration**: Coordinated specialist agents for complex workflows
- **Tested Architectures**: Sample data and deployment scripts for every use case
- **Flexible Deployment**: Deploy to Amazon Bedrock AgentCore via automated CI/CD pipeline
- **AgentCore Observability**: Optional X-Ray + CloudWatch tracing, enabled per deployment

## Domains

- **Banking** — Customer onboarding, engagement, document search, and payment automation
- **Risk & Compliance** — Fraud detection, compliance investigation, adverse media screening, credit risk
- **Capital Markets** — Trading, market surveillance, investment advisory, research, and analytics
- **Insurance** — Claims processing and life insurance agent assistance
- **Operations** — Document processing, analytics, and communication automation
- **Modernization** — Legacy migration, code generation, mainframe modernization
- **Payments** — Agentic payment flows and payment operations

## Framework Support

Every use case includes dual implementations. Select your preferred framework in the deployment form:

| Framework | Description | Best For |
|---|---|---|
| **Strands Agent SDK** | AWS-native agentic framework with Bedrock integration and AgentCore Runtime support | New projects, AWS-native teams |
| **LangChain/LangGraph** | Graph-based orchestration with deterministic state machines | Teams with existing LangChain investment, complex conditional flows |

## AgentCore Observability (Opt-In)

When deploying a use case, check the **"Enable AgentCore Observability"** checkbox to activate X-Ray Transaction Search and CloudWatch Logs for that agent. This is **opt-in per deployment** — not automatically enabled — because it incurs additional CloudWatch and X-Ray ingest costs. See the [Observability](#observability-agentcore) section for setup prerequisites.

## Deployment Process

1. Navigate to \`/applications/fsi-foundry\` and select a use case
2. Click **Deploy** to open the deployment form
3. Choose framework (Strands or LangGraph) and target region
4. Optionally enable AgentCore Observability
5. Click **Deploy** — the platform submits a Step Functions job that runs CodeBuild to provision all infrastructure

The pipeline automatically provisions: ECR repository, IAM roles, S3 buckets, and the AgentCore Runtime endpoint. Deployment status is tracked in real time on the deployment detail page.`,
      },
      {
        id: 'banking',
        title: 'Banking',
        children: [
          {
            id: 'kyc-banking',
            title: 'KYC Banking',
            children: [
              {
                id: 'kyc-banking-business',
                title: 'Business & Agent Design',
                content: `# KYC Banking — Business & Agent Design

## Business Overview

The KYC Banking application automates corporate customer due diligence for banking onboarding. It combines financial creditworthiness analysis with regulatory compliance screening to produce risk-scored recommendations for relationship approvals.

## Assessment Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Assessment** | Complete credit + compliance evaluation | Both agents in parallel |
| **Credit Only** | Financial analysis only | Credit Analyst |
| **Compliance Only** | Regulatory screening only | Compliance Officer |

## Agent Design

### Orchestrator — Senior Risk Assessment Supervisor

Coordinates specialist agents and synthesizes their findings into a comprehensive risk assessment. Makes final recommendations: **APPROVE**, **REJECT**, or **ESCALATE FOR REVIEW**.

Considers:
- Overall risk profile combining credit and compliance assessments
- Conflicts or discrepancies between specialist reports
- Key conditions or requirements for approval

### Credit Analyst Agent

Specializes in corporate banking credit risk evaluation.

**Analysis Scope**:
- Historical credit performance and payment behavior
- Financial statement analysis (debt ratios, liquidity, profitability)
- Industry sector risks and economic conditions
- Corporate structure and ownership complexity
- Transaction volume and patterns

**Data Retrieved via S3**:
- Customer profile data
- Credit history records
- Transaction history

**Output**: Risk Score (0–100), Risk Level, Key Risk Factors, Credit Limit Recommendations

### Compliance Officer Agent

Specializes in KYC and AML regulatory compliance for corporate banking.

**Compliance Checks**:
- Corporate registration and legal entity verification
- Beneficial ownership identification (UBO)
- Source of funds and wealth verification
- Sanctions screening (OFAC, UN, EU lists)
- PEP screening for directors and beneficial owners
- Adverse media screening
- Geographic risk assessment (high-risk jurisdictions)
- Industry/sector risk (high-risk business types)

**Data Retrieved via S3**:
- Customer profile data
- Compliance records
- Transaction history

**Output**: Compliance Status (COMPLIANT / NON_COMPLIANT / REVIEW_REQUIRED), Passed/Failed Checks, Regulatory Notes

## Risk Classification

| Risk Level | Score Range | Recommendation |
|-----------|-------------|----------------|
| LOW | 0–49 | Approve — standard monitoring |
| MEDIUM | 50–74 | Approve — enhanced monitoring |
| HIGH | 75–89 | Escalate for manual review |
| CRITICAL | 90–100 | Deny or require executive approval |

## Synthesis Output

The orchestrator produces a structured JSON response containing:
- **Credit Risk**: score, level, contributing factors, recommendations
- **Compliance**: status, passed checks, failed checks, regulatory notes
- **Executive Summary**: Overall assessment with APPROVE / REJECT / ESCALATE recommendation`,
              },
              {
                id: 'kyc-banking-architecture',
                title: 'Technical Architecture',
                content: `# KYC Banking — Technical Architecture

## Full Assessment Flow

\`\`\`diagram:kyc-assessment-flow
\`\`\`

## LangGraph State Machine

\`\`\`diagram:kyc-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/kyc_banking/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py              # KYCSettings, model IDs, thresholds
    │   ├── models.py              # Pydantic schemas (shared)
    │   ├── orchestrator.py        # KYCOrchestrator (StrandsOrchestrator)
    │   └── agents/
    │       ├── credit_analyst.py  # CreditAnalyst (StrandsAgent)
    │       └── compliance_officer.py  # ComplianceOfficer (StrandsAgent)
    └── langchain_langgraph/
        ├── config.py              # KYCSettings, model IDs, thresholds
        ├── models.py              # Pydantic schemas (shared)
        ├── orchestrator.py        # KYCOrchestrator (LangGraphOrchestrator)
        └── agents/
            ├── credit_analyst.py  # CreditAnalyst (LangGraphAgent)
            └── compliance_officer.py  # ComplianceOfficer (LangGraphAgent)
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "customer_id": "CUST001",
  "assessment_type": "full",
  "additional_context": "Priority onboarding for Q4"
}
\`\`\`

**assessment_type options**: \`full\`, \`credit_only\`, \`compliance_only\`

### Response Schema

\`\`\`json
{
  "customer_id": "CUST001",
  "assessment_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "credit_risk": {
    "score": 25,
    "level": "low",
    "factors": ["Strong payment history", "Low debt ratio"],
    "recommendations": ["Standard credit limit approved"]
  },
  "compliance": {
    "status": "compliant",
    "checks_passed": ["KYC verification", "Sanctions screening", "PEP screening"],
    "checks_failed": [],
    "regulatory_notes": ["Clean compliance record"]
  },
  "summary": "Low-risk corporate client. Recommendation: APPROVE with standard monitoring.",
  "raw_analysis": {
    "credit_analysis": { ... },
    "compliance_check": { ... }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent risk scoring) |
| **Risk Threshold (High)** | 75 |
| **Risk Threshold (Critical)** | 90 |

## Tool Integration

Both agents use the **s3_retriever_tool** to fetch customer data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|---------|
| \`profile\` | \`samples/kyc_banking/{customer_id}/profile.json\` | Both agents |
| \`credit_history\` | \`samples/kyc_banking/{customer_id}/credit_history.json\` | Credit Analyst |
| \`compliance\` | \`samples/kyc_banking/{customer_id}/compliance.json\` | Compliance Officer |
| \`transactions\` | \`samples/kyc_banking/{customer_id}/transactions.json\` | Both agents |`,
              },
              {
                id: 'kyc-banking-deployment',
                title: 'Deployment & Testing',
                content: `# KYC Banking — Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:kyc-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** → **Banking** → **KYC Banking**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`kyc-banking-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=kyc_banking \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=kyc_banking \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|---------|
| ECR Repository | Container image for KYC agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample customer data (profiles, credit history, compliance records) |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8–12 minutes.

## Sample Test Data

| Customer ID | Description | Expected Risk | Expected Compliance |
|-------------|-------------|--------------|-------------------|
| CUST001 | Established manufacturing company, clean record | LOW (score ~25) | COMPLIANT |
| CUST002 | Tech startup, higher debt ratio, thin credit | MEDIUM (score ~55) | COMPLIANT |
| CUST003 | Import/export business, PEP exposure, high-risk jurisdiction | HIGH (score ~80) | REVIEW_REQUIRED |

## Testing the Deployed Runtime

### Full Assessment (Both Agents)
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "customer_id": "CUST001",
  "assessment_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Credit-Only Assessment
\`\`\`bash
PAYLOAD=$(echo -n '{
  "customer_id": "CUST002",
  "assessment_type": "credit_only"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json
\`\`\`

### Compliance-Only Assessment
\`\`\`bash
PAYLOAD=$(echo -n '{
  "customer_id": "CUST003",
  "assessment_type": "compliance_only"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/kyc_banking/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/kyc_banking/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'customer-service',
            title: 'Customer Service',
            children: [
              {
                id: 'customer-service-business',
                title: 'Business & Agent Design',
                content: `# Customer Service -- Business & Agent Design

## Business Overview

The Customer Service application automates multi-channel banking support by coordinating specialist agents for inquiry handling, transaction investigation, and product advisory. It resolves customer issues end-to-end with intelligent routing based on inquiry type and produces structured resolution summaries for service representatives.

## Assessment Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Service** | Complete inquiry + transaction + product analysis | All agents in parallel |
| **General Inquiry** | Account questions and general banking support | Inquiry Handler |
| **Transaction Dispute** | Transaction investigation and resolution | Transaction Specialist |
| **Product Inquiry** | Product recommendations and eligibility | Product Advisor |
| **Service Request** | Combined inquiry and transaction handling | Inquiry Handler + Transaction Specialist |

## Agent Design

### Orchestrator -- Senior Customer Service Supervisor

Coordinates specialist agents and synthesizes their findings into a comprehensive customer service resolution. Makes final determination: **RESOLVED**, **PENDING**, or **ESCALATED**.

Considers:
- Resolution status and completeness of the customer's inquiry
- Escalation needs or follow-up actions required
- Product recommendations matching the customer's profile
- Clear next steps for the customer

### Inquiry Handler Agent

Specializes in general banking inquiry resolution and account support.

**Responsibilities**:
- Account balance and status inquiries
- Banking policy and procedure questions
- Service availability and branch information
- General complaint intake and categorization
- Initial triage and priority assessment

**Data Retrieved via S3**:
- Customer profile data
- Account history records

**Output**: Inquiry Classification, Resolution Path, Priority Level, Recommended Actions

### Transaction Specialist Agent

Specializes in transaction investigation, dispute resolution, and payment issue analysis.

**Responsibilities**:
- Transaction history analysis and anomaly detection
- Dispute investigation and evidence gathering
- Payment failure root cause identification
- Chargeback eligibility assessment
- Transaction reversal and correction recommendations

**Data Retrieved via S3**:
- Customer profile data
- Transaction history

**Output**: Investigation Findings, Dispute Status, Resolution Recommendations, Refund Eligibility

### Product Advisor Agent

Specializes in product recommendations, cross-sell opportunities, and eligibility assessment.

**Responsibilities**:
- Customer needs analysis based on profile and history
- Product matching and recommendation generation
- Eligibility verification for banking products
- Cross-sell and upsell opportunity identification
- Competitive comparison and feature explanation

**Data Retrieved via S3**:
- Customer profile data
- Product catalog

**Output**: Product Recommendations, Eligibility Status, Feature Comparisons, Next Steps

## Resolution Status

| Status | Description | Action |
|--------|-------------|--------|
| **RESOLVED** | Issue fully addressed | Close ticket, send confirmation |
| **PENDING** | Requires follow-up | Schedule callback, assign specialist |
| **ESCALATED** | Complex or high-priority | Route to senior representative |

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/customer_service\` |
| **Max Response Time** | \`30 seconds\` |
| **Escalation Threshold** | \`0.8\` |
| **Satisfaction Target** | \`0.9\` |`,
              },
              {
                id: 'customer-service-architecture',
                title: 'Technical Architecture',
                content: `# Customer Service -- Technical Architecture

## Assessment Flow

\`\`\`diagram:customer-service-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:customer-service-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/customer_service/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py              # CustomerServiceSettings
    │   ├── models.py              # Pydantic schemas (shared)
    │   ├── orchestrator.py        # CustomerServiceOrchestrator
    │   └── agents/
    │       ├── inquiry_handler.py
    │       ├── transaction_specialist.py
    │       └── product_advisor.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── inquiry_handler.py
            ├── transaction_specialist.py
            └── product_advisor.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "customer_id": "CUST001",
  "inquiry_type": "full",
  "additional_context": "Customer calling about recent transaction"
}
\`\`\`

**inquiry_type options**: \`full\`, \`general\`, \`transaction_dispute\`, \`product_inquiry\`, \`service_request\`

### Response Schema

\`\`\`json
{
  "customer_id": "CUST001",
  "service_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "resolution": {
    "status": "resolved",
    "actions_taken": ["Verified account", "Reviewed transactions"],
    "follow_up_required": false
  },
  "recommendations": ["Premium checking upgrade eligible"],
  "summary": "Customer inquiry resolved. No disputes found.",
  "raw_analysis": {
    "inquiry_result": { "..." : "..." },
    "transaction_result": { "..." : "..." },
    "product_result": { "..." : "..." }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|---------|
| \`profile\` | \`samples/customer_service/{customer_id}/profile.json\` | All agents |
| \`account_history\` | \`samples/customer_service/{customer_id}/account_history.json\` | Inquiry Handler |
| \`transactions\` | \`samples/customer_service/{customer_id}/transactions.json\` | Transaction Specialist |
| \`products\` | \`samples/customer_service/{customer_id}/products.json\` | Product Advisor |`,
              },
              {
                id: 'customer-service-deployment',
                title: 'Deployment & Testing',
                content: `# Customer Service -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:customer-service-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Banking** -> **Customer Service**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`customer-service-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=customer_service \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=customer_service \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|---------|
| ECR Repository | Container image for Customer Service agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample customer data (profiles, account history, transactions) |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Customer ID | Description | Expected Resolution |
|-------------|-------------|-------------------|
| CUST001 | Active retail customer, recent transactions, no disputes | RESOLVED with product recommendations |
| CUST002 | Customer with pending transaction dispute | PENDING with investigation follow-up |

## Testing the Deployed Runtime

### Full Service Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "customer_id": "CUST001",
  "inquiry_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Transaction Dispute Assessment
\`\`\`bash
PAYLOAD=$(echo -n '{
  "customer_id": "CUST002",
  "inquiry_type": "transaction_dispute"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/customer_service/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/customer_service/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'document-search',
            title: 'Document Search',
            children: [
              {
                id: 'document-search-business',
                title: 'Business & Agent Design',
                content: `# Document Search -- Business & Agent Design

## Business Overview

The Document Search application enables semantic search and intelligent retrieval across enterprise banking document repositories. It combines document indexing with AI-powered search to help users find relevant policies, procedures, regulatory filings, and internal documentation quickly and accurately.

## Processing Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Search** | Complete indexing + semantic search | Both agents in sequence |
| **Index Only** | Document indexing and metadata extraction | Document Indexer |
| **Search Only** | Semantic search across indexed documents | Search Agent |

## Agent Design

### Orchestrator -- Document Search Supervisor

Coordinates the Document Indexer and Search Agent to provide comprehensive document retrieval. Routes queries through indexing when new documents are detected, then executes semantic search with relevance ranking.

Considers:
- Query intent and semantic understanding
- Document freshness and relevance scoring
- Result diversity and deduplication
- Source attribution and confidence levels

### Document Indexer Agent

Specializes in document classification, metadata extraction, and index maintenance.

**Responsibilities**:
- Document type identification and categorization
- Key metadata extraction (dates, authors, topics)
- Content chunking and embedding generation
- Index update and maintenance operations
- Document relationship mapping

**Data Retrieved via S3**:
- Document repository data
- Existing index metadata

**Output**: Index Status, Document Metadata, Content Chunks, Categorization Tags

### Search Agent

Specializes in semantic search, relevance ranking, and result curation.

**Responsibilities**:
- Natural language query interpretation
- Semantic similarity matching across document corpus
- Relevance scoring and result ranking
- Snippet generation and context extraction
- Multi-faceted search with filtering

**Data Retrieved via S3**:
- Search index data
- Document content

**Output**: Search Results, Relevance Scores, Document Snippets, Source References

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/document_search\` |
| **Relevance Threshold** | \`0.7\` |
| **Max Results** | \`20\` |`,
              },
              {
                id: 'document-search-architecture',
                title: 'Technical Architecture',
                content: `# Document Search -- Technical Architecture

## Assessment Flow

\`\`\`diagram:document-search-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:document-search-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/document_search/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py              # DocumentSearchSettings
    │   ├── models.py              # Pydantic schemas (shared)
    │   ├── orchestrator.py        # DocumentSearchOrchestrator
    │   └── agents/
    │       ├── document_indexer.py
    │       └── search_agent.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── document_indexer.py
            └── search_agent.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "document_id": "DOC001",
  "search_type": "full",
  "additional_context": "Find compliance policy documents"
}
\`\`\`

**search_type options**: \`full\`, \`index_only\`, \`search_only\`

### Response Schema

\`\`\`json
{
  "document_id": "DOC001",
  "search_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "results": [
    {
      "title": "AML Compliance Policy v3.2",
      "relevance_score": 0.95,
      "snippet": "Section 4.2 outlines customer due diligence..."
    }
  ],
  "summary": "Found 5 relevant documents matching query.",
  "raw_analysis": {
    "indexer_result": { "..." : "..." },
    "search_result": { "..." : "..." }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|---------|
| \`profile\` | \`samples/document_search/{document_id}/profile.json\` | Both agents |
| \`documents\` | \`samples/document_search/{document_id}/documents.json\` | Document Indexer |
| \`search_index\` | \`samples/document_search/{document_id}/search_index.json\` | Search Agent |`,
              },
              {
                id: 'document-search-deployment',
                title: 'Deployment & Testing',
                content: `# Document Search -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:document-search-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Banking** -> **Document Search**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`document-search-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=document_search \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=document_search \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|---------|
| ECR Repository | Container image for Document Search agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample document repository data |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Document ID | Description | Expected Output |
|-------------|-------------|----------------|
| DOC001 | Banking compliance document set | 5+ relevant results with high relevance scores |
| DOC002 | Internal procedure manual collection | Categorized results with snippet extraction |

## Testing the Deployed Runtime

### Full Search
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "document_id": "DOC001",
  "search_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/document_search/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/document_search/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'agentic-payments',
            title: 'Agentic Payments',
            children: [
              {
                id: 'agentic-payments-business',
                title: 'Business & Agent Design',
                content: `# Agentic Payments -- Business & Agent Design

## Business Overview

The Agentic Payments application automates intelligent payment processing with validation, optimal routing, and reconciliation. It coordinates specialist agents to verify payment integrity, select the best processing network, and ensure accurate settlement across banking channels.

## Processing Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Processing** | Complete validation + routing + reconciliation | All agents in parallel |
| **Validation Only** | Payment integrity and compliance checks | Payment Validator |
| **Routing Only** | Optimal network and path selection | Routing Agent |
| **Reconciliation** | Settlement matching and verification | Reconciliation Agent |

## Agent Design

### Orchestrator -- Payment Processing Supervisor

Coordinates specialist agents to ensure payments are validated, optimally routed, and reconciled. Produces final payment disposition with status and audit trail.

Considers:
- Payment validity and compliance with banking regulations
- Optimal routing for cost, speed, and reliability
- Reconciliation accuracy and exception identification
- End-to-end audit trail for regulatory compliance

### Payment Validator Agent

Specializes in payment integrity verification and compliance screening.

**Responsibilities**:
- Amount verification and limit checks
- Account balance and status validation
- Beneficiary verification and sanctions screening
- Duplicate payment detection
- Regulatory compliance checks (AML, CTR thresholds)

**Data Retrieved via S3**:
- Payment request data
- Account profile data

**Output**: Validation Status, Compliance Flags, Risk Indicators, Authorization Decision

### Routing Agent

Specializes in payment network selection and path optimization.

**Responsibilities**:
- Network selection (ACH, Wire, SWIFT, RTP)
- Cost optimization across available channels
- Speed and SLA requirement matching
- Fallback routing for network failures
- Cross-border routing and currency considerations

**Data Retrieved via S3**:
- Payment request data
- Network configuration

**Output**: Selected Route, Cost Estimate, Expected Settlement Time, Fallback Options

### Reconciliation Agent

Specializes in payment settlement matching and exception handling.

**Responsibilities**:
- Transaction matching across systems
- Settlement amount verification
- Exception identification and categorization
- Discrepancy root cause analysis
- Reconciliation report generation

**Data Retrieved via S3**:
- Settlement records
- Transaction history

**Output**: Reconciliation Status, Matched Transactions, Exceptions, Discrepancy Details

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/agentic_payments\` |
| **Max Processing Time** | \`30 seconds\` |
| **Validation Threshold** | \`0.95\` |`,
              },
              {
                id: 'agentic-payments-architecture',
                title: 'Technical Architecture',
                content: `# Agentic Payments -- Technical Architecture

## Assessment Flow

\`\`\`diagram:agentic-payments-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:agentic-payments-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/agentic_payments/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py              # AgenticPaymentsSettings
    │   ├── models.py              # Pydantic schemas (shared)
    │   ├── orchestrator.py        # AgenticPaymentsOrchestrator
    │   └── agents/
    │       ├── payment_validator.py
    │       ├── routing_agent.py
    │       └── reconciliation_agent.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── payment_validator.py
            ├── routing_agent.py
            └── reconciliation_agent.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "payment_id": "PAY001",
  "processing_type": "full",
  "additional_context": "Priority wire transfer"
}
\`\`\`

**processing_type options**: \`full\`, \`validation_only\`, \`routing_only\`, \`reconciliation\`

### Response Schema

\`\`\`json
{
  "payment_id": "PAY001",
  "processing_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "validation": {
    "status": "approved",
    "compliance_flags": [],
    "risk_score": 15
  },
  "routing": {
    "selected_network": "SWIFT",
    "estimated_cost": 25.00,
    "settlement_time": "T+1"
  },
  "reconciliation": {
    "status": "matched",
    "exceptions": []
  },
  "summary": "Payment validated and routed via SWIFT. Settlement expected T+1.",
  "raw_analysis": {
    "validation_result": { "..." : "..." },
    "routing_result": { "..." : "..." },
    "reconciliation_result": { "..." : "..." }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|---------|
| \`profile\` | \`samples/agentic_payments/{payment_id}/profile.json\` | All agents |
| \`payment_request\` | \`samples/agentic_payments/{payment_id}/payment_request.json\` | Payment Validator, Routing Agent |
| \`settlement\` | \`samples/agentic_payments/{payment_id}/settlement.json\` | Reconciliation Agent |
| \`transactions\` | \`samples/agentic_payments/{payment_id}/transactions.json\` | Reconciliation Agent |`,
              },
              {
                id: 'agentic-payments-deployment',
                title: 'Deployment & Testing',
                content: `# Agentic Payments -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:agentic-payments-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Banking** -> **Agentic Payments**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`agentic-payments-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=agentic_payments \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=agentic_payments \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|---------|
| ECR Repository | Container image for Agentic Payments agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample payment data (requests, settlements, transactions) |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Payment ID | Description | Expected Output |
|------------|-------------|----------------|
| PAY001 | Domestic wire transfer, valid beneficiary | Approved, routed via Fedwire, T+0 settlement |
| PAY002 | Cross-border SWIFT payment, compliance flagged | Review required, enhanced screening triggered |

## Testing the Deployed Runtime

### Full Processing
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "payment_id": "PAY001",
  "processing_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/agentic_payments/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/agentic_payments/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'payment-operations',
            title: 'Payment Operations',
            children: [
              {
                id: 'payment-operations-business',
                title: 'Business & Agent Design',
                content: `# Payment Operations -- Business & Agent Design

## Business Overview

The Payment Operations application automates payment exception handling and settlement operations. It coordinates specialist agents to identify failed or stalled payments, determine root causes, and execute resolution strategies to ensure timely settlement across banking channels.

## Processing Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Operations** | Complete exception handling + settlement | Both agents in parallel |
| **Exception Handling** | Failed payment analysis and resolution | Exception Handler |
| **Settlement Only** | Settlement processing and verification | Settlement Agent |

## Agent Design

### Orchestrator -- Payment Operations Supervisor

Coordinates the Exception Handler and Settlement Agent to resolve payment issues and ensure accurate settlement. Produces structured operations reports with resolution status.

Considers:
- Exception severity and business impact
- Root cause patterns across payment failures
- Settlement accuracy and timing requirements
- Escalation paths for unresolvable exceptions

### Exception Handler Agent

Specializes in failed payment analysis, root cause identification, and resolution.

**Responsibilities**:
- Failed payment classification and categorization
- Root cause analysis (insufficient funds, network errors, validation failures)
- Automated retry strategy determination
- Manual intervention queue management
- Exception trend analysis and reporting

**Data Retrieved via S3**:
- Payment exception records
- Account profile data

**Output**: Exception Classification, Root Cause, Resolution Strategy, Retry Recommendations

### Settlement Agent

Specializes in payment settlement processing and verification.

**Responsibilities**:
- Settlement instruction generation
- Balance verification and fund availability
- Settlement timing optimization
- Nostro/vostro account reconciliation
- End-of-day settlement reporting

**Data Retrieved via S3**:
- Settlement records
- Transaction history

**Output**: Settlement Status, Matched Entries, Discrepancies, Settlement Report

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/payment_operations\` |
| **Max Processing Time** | \`30 seconds\` |
| **Retry Limit** | \`3\` |`,
              },
              {
                id: 'payment-operations-architecture',
                title: 'Technical Architecture',
                content: `# Payment Operations -- Technical Architecture

## Assessment Flow

\`\`\`diagram:payment-operations-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:payment-operations-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/payment_operations/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py              # PaymentOperationsSettings
    │   ├── models.py              # Pydantic schemas (shared)
    │   ├── orchestrator.py        # PaymentOperationsOrchestrator
    │   └── agents/
    │       ├── exception_handler.py
    │       └── settlement_agent.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── exception_handler.py
            └── settlement_agent.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "payment_id": "PAY001",
  "operation_type": "full",
  "additional_context": "End-of-day settlement batch"
}
\`\`\`

**operation_type options**: \`full\`, \`exception_handling\`, \`settlement_only\`

### Response Schema

\`\`\`json
{
  "payment_id": "PAY001",
  "operation_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "exceptions": {
    "total": 3,
    "resolved": 2,
    "pending": 1,
    "details": [...]
  },
  "settlement": {
    "status": "completed",
    "matched_count": 150,
    "discrepancies": 1
  },
  "summary": "Settlement batch processed. 2 of 3 exceptions resolved.",
  "raw_analysis": {
    "exception_result": { "..." : "..." },
    "settlement_result": { "..." : "..." }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|---------|
| \`profile\` | \`samples/payment_operations/{payment_id}/profile.json\` | Both agents |
| \`exceptions\` | \`samples/payment_operations/{payment_id}/exceptions.json\` | Exception Handler |
| \`settlement\` | \`samples/payment_operations/{payment_id}/settlement.json\` | Settlement Agent |
| \`transactions\` | \`samples/payment_operations/{payment_id}/transactions.json\` | Both agents |`,
              },
              {
                id: 'payment-operations-deployment',
                title: 'Deployment & Testing',
                content: `# Payment Operations -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:payment-operations-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Banking** -> **Payment Operations**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`payment-operations-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=payment_operations \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=payment_operations \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|---------|
| ECR Repository | Container image for Payment Operations agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample payment operations data (exceptions, settlements) |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Payment ID | Description | Expected Output |
|------------|-------------|----------------|
| PAY001 | Batch with 3 exceptions, 2 auto-resolvable | 2 resolved, 1 pending manual review |
| PAY002 | Clean settlement batch, no exceptions | All matched, settlement completed |

## Testing the Deployed Runtime

### Full Operations
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "payment_id": "PAY001",
  "operation_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/payment_operations/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/payment_operations/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'customer-chatbot',
            title: 'Customer Chatbot',
            children: [
              {
                id: 'customer-chatbot-business',
                title: 'Business & Agent Design',
                content: `# Customer Chatbot -- Business & Agent Design

## Business Overview

The Customer Chatbot application delivers 24/7 AI-powered banking support through natural language understanding. It coordinates specialist agents for account management, transaction handling, and general inquiries to provide seamless conversational banking experiences across digital channels.

## Interaction Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Conversation** | Complete account + transaction + general support | All agents in parallel |
| **Account Inquiry** | Balance checks, account details, statements | Account Agent |
| **Transaction Request** | Transfers, payments, transaction history | Transaction Agent |
| **General Support** | FAQ, branch info, product questions | Conversation Manager |

## Agent Design

### Orchestrator -- Conversation Supervisor

Coordinates specialist agents to manage multi-turn banking conversations. Routes user intents to appropriate specialists and maintains conversation context across interactions.

Considers:
- User intent classification and routing accuracy
- Conversation context and history
- Authentication and security requirements
- Escalation triggers for complex requests

### Conversation Manager Agent

Specializes in conversation flow management, intent detection, and general inquiry handling.

**Responsibilities**:
- Natural language intent classification
- Conversation state and context management
- General banking FAQ responses
- Greeting, farewell, and small talk handling
- Escalation to human agent when needed

**Data Retrieved via S3**:
- Customer profile data
- FAQ knowledge base

**Output**: Intent Classification, Response Text, Conversation State, Escalation Flag

### Account Agent

Specializes in account-related inquiries and operations.

**Responsibilities**:
- Account balance and status inquiries
- Statement generation and delivery
- Account detail updates and verification
- Multi-account summary and comparison
- Account alert and notification management

**Data Retrieved via S3**:
- Customer profile data
- Account data

**Output**: Account Information, Balance Details, Statement Data, Update Confirmation

### Transaction Agent

Specializes in transaction processing and history inquiries.

**Responsibilities**:
- Fund transfer initiation and confirmation
- Transaction history search and filtering
- Payment scheduling and management
- Transaction status tracking
- Spending category analysis

**Data Retrieved via S3**:
- Customer profile data
- Transaction history

**Output**: Transaction Status, Transfer Confirmation, History Results, Spending Summary

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/customer_chatbot\` |
| **Max Response Time** | \`15 seconds\` |
| **Context Window** | \`10 turns\` |`,
              },
              {
                id: 'customer-chatbot-architecture',
                title: 'Technical Architecture',
                content: `# Customer Chatbot -- Technical Architecture

## Assessment Flow

\`\`\`diagram:customer-chatbot-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:customer-chatbot-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/customer_chatbot/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py              # CustomerChatbotSettings
    │   ├── models.py              # Pydantic schemas (shared)
    │   ├── orchestrator.py        # CustomerChatbotOrchestrator
    │   └── agents/
    │       ├── conversation_manager.py
    │       ├── account_agent.py
    │       └── transaction_agent.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── conversation_manager.py
            ├── account_agent.py
            └── transaction_agent.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "customer_id": "CUST001",
  "message": "What is my checking account balance?",
  "conversation_id": "conv-001"
}
\`\`\`

### Response Schema

\`\`\`json
{
  "customer_id": "CUST001",
  "conversation_id": "conv-001",
  "timestamp": "2025-03-15T10:30:00Z",
  "response": "Your checking account ending in 4523 has a balance of $12,450.00.",
  "intent": "account_balance",
  "agent_used": "account_agent",
  "raw_analysis": {
    "conversation_result": { "..." : "..." },
    "account_result": { "..." : "..." }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|---------|
| \`profile\` | \`samples/customer_chatbot/{customer_id}/profile.json\` | All agents |
| \`accounts\` | \`samples/customer_chatbot/{customer_id}/accounts.json\` | Account Agent |
| \`transactions\` | \`samples/customer_chatbot/{customer_id}/transactions.json\` | Transaction Agent |
| \`faq\` | \`samples/customer_chatbot/{customer_id}/faq.json\` | Conversation Manager |`,
              },
              {
                id: 'customer-chatbot-deployment',
                title: 'Deployment & Testing',
                content: `# Customer Chatbot -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:customer-chatbot-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Banking** -> **Customer Chatbot**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`customer-chatbot-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=customer_chatbot \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=customer_chatbot \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|---------|
| ECR Repository | Container image for Customer Chatbot agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample customer data (profiles, accounts, transactions) |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Customer ID | Description | Expected Output |
|-------------|-------------|----------------|
| CUST001 | Active customer with checking and savings accounts | Accurate balance and transaction responses |
| CUST002 | Customer with recent transfer activity | Transaction history and status updates |

## Testing the Deployed Runtime

### Account Balance Inquiry
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "customer_id": "CUST001",
  "message": "What is my account balance?"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/customer_chatbot/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/customer_chatbot/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'customer-support',
            title: 'Customer Support',
            children: [
              {
                id: 'customer-support-business',
                title: 'Business & Agent Design',
                content: `# Customer Support -- Business & Agent Design

## Business Overview

The Customer Support application automates ticket classification, resolution, and escalation management for banking support operations. It coordinates specialist agents to categorize incoming support requests, determine optimal resolution paths, and manage escalation workflows for complex issues.

## Processing Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Support** | Complete classification + resolution + escalation | All agents in sequence |
| **Classification Only** | Ticket categorization and priority assignment | Ticket Classifier |
| **Resolution Only** | Solution recommendation and implementation | Resolution Agent |
| **Escalation** | Complex case routing and specialist assignment | Escalation Agent |

## Agent Design

### Orchestrator -- Support Operations Supervisor

Coordinates specialist agents in a sequential pipeline: classify, resolve, and escalate as needed. Produces structured support reports with resolution status and SLA tracking.

Considers:
- Ticket priority and SLA requirements
- Resolution completeness and customer satisfaction
- Escalation necessity based on complexity thresholds
- Historical resolution patterns for similar issues

### Ticket Classifier Agent

Specializes in support ticket categorization and priority assignment.

**Responsibilities**:
- Issue type identification and categorization
- Priority level assignment (P1-P4)
- SLA requirement determination
- Skill-based routing recommendation
- Duplicate ticket detection

**Data Retrieved via S3**:
- Ticket data
- Customer profile data

**Output**: Ticket Category, Priority Level, SLA Target, Routing Recommendation

### Resolution Agent

Specializes in solution determination and implementation guidance.

**Responsibilities**:
- Knowledge base search for known solutions
- Step-by-step resolution procedure generation
- Automated fix application where possible
- Customer communication drafting
- Resolution verification and confirmation

**Data Retrieved via S3**:
- Ticket data
- Knowledge base

**Output**: Resolution Steps, Automated Actions, Customer Communication, Resolution Status

### Escalation Agent

Specializes in complex case routing and specialist assignment.

**Responsibilities**:
- Escalation criteria evaluation
- Specialist team identification and assignment
- Priority adjustment and SLA recalculation
- Management notification for critical issues
- Cross-team coordination for multi-domain problems

**Data Retrieved via S3**:
- Ticket data
- Escalation rules

**Output**: Escalation Level, Assigned Team, Updated Priority, Management Notifications

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/customer_support\` |
| **Max Resolution Time** | \`30 seconds\` |
| **Escalation Threshold** | \`P2 or above\` |`,
              },
              {
                id: 'customer-support-architecture',
                title: 'Technical Architecture',
                content: `# Customer Support -- Technical Architecture

## Assessment Flow

\`\`\`diagram:customer-support-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:customer-support-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/customer_support/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py              # CustomerSupportSettings
    │   ├── models.py              # Pydantic schemas (shared)
    │   ├── orchestrator.py        # CustomerSupportOrchestrator
    │   └── agents/
    │       ├── ticket_classifier.py
    │       ├── resolution_agent.py
    │       └── escalation_agent.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── ticket_classifier.py
            ├── resolution_agent.py
            └── escalation_agent.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "ticket_id": "TKT001",
  "support_type": "full",
  "additional_context": "Customer unable to access online banking"
}
\`\`\`

**support_type options**: \`full\`, \`classification_only\`, \`resolution_only\`, \`escalation\`

### Response Schema

\`\`\`json
{
  "ticket_id": "TKT001",
  "support_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "classification": {
    "category": "access_issue",
    "priority": "P2",
    "sla_target": "4 hours"
  },
  "resolution": {
    "status": "resolved",
    "steps_taken": ["Password reset initiated", "MFA reconfigured"],
    "customer_notified": true
  },
  "summary": "Access issue resolved via password reset and MFA reconfiguration.",
  "raw_analysis": {
    "classification_result": { "..." : "..." },
    "resolution_result": { "..." : "..." },
    "escalation_result": { "..." : "..." }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|---------|
| \`profile\` | \`samples/customer_support/{ticket_id}/profile.json\` | All agents |
| \`ticket\` | \`samples/customer_support/{ticket_id}/ticket.json\` | Ticket Classifier |
| \`knowledge_base\` | \`samples/customer_support/{ticket_id}/knowledge_base.json\` | Resolution Agent |
| \`escalation_rules\` | \`samples/customer_support/{ticket_id}/escalation_rules.json\` | Escalation Agent |`,
              },
              {
                id: 'customer-support-deployment',
                title: 'Deployment & Testing',
                content: `# Customer Support -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:customer-support-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Banking** -> **Customer Support**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`customer-support-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=customer_support \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=customer_support \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|---------|
| ECR Repository | Container image for Customer Support agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample support data (tickets, knowledge base, escalation rules) |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Ticket ID | Description | Expected Output |
|-----------|-------------|----------------|
| TKT001 | Online banking access issue, P2 priority | Resolved via password reset, within SLA |
| TKT002 | Complex regulatory complaint, requires escalation | Escalated to compliance team |

## Testing the Deployed Runtime

### Full Support Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "ticket_id": "TKT001",
  "support_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/customer_support/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/customer_support/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'ai-assistant',
            title: 'AI Assistant',
            children: [
              {
                id: 'ai-assistant-business',
                title: 'Business & Agent Design',
                content: `# Banking AI Assistant -- Business & Agent Design

## Business Overview

The Banking AI Assistant provides general-purpose AI support for banking operations with intelligent task routing, data lookup, and report generation. It coordinates specialist agents to handle diverse employee requests ranging from data retrieval to automated report creation.

## Processing Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Assistance** | Complete task routing + data lookup + reporting | All agents as needed |
| **Task Routing** | Intent classification and task delegation | Task Router |
| **Data Lookup** | Information retrieval and data querying | Data Lookup Agent |
| **Report Generation** | Automated report creation and formatting | Report Generator |

## Agent Design

### Orchestrator -- AI Assistant Supervisor

Coordinates specialist agents to fulfill diverse employee requests. Routes tasks intelligently based on intent classification and produces comprehensive responses.

Considers:
- Request intent and complexity assessment
- Data availability and access permissions
- Report format requirements and audience
- Response quality and completeness

### Task Router Agent

Specializes in request classification and intelligent task delegation.

**Responsibilities**:
- Natural language intent classification
- Task decomposition for complex requests
- Agent selection and routing
- Priority assessment and queuing
- Multi-step workflow orchestration

**Data Retrieved via S3**:
- Employee profile data
- Task configuration

**Output**: Task Classification, Routing Decision, Priority Level, Execution Plan

### Data Lookup Agent

Specializes in information retrieval across banking data sources.

**Responsibilities**:
- Structured data querying and retrieval
- Cross-system data aggregation
- Data formatting and presentation
- Cache management for frequent queries
- Access control and permission verification

**Data Retrieved via S3**:
- Employee profile data
- Banking data sources

**Output**: Query Results, Data Summary, Source References, Access Audit

### Report Generator Agent

Specializes in automated report creation and formatting.

**Responsibilities**:
- Report template selection and customization
- Data aggregation and visualization preparation
- Executive summary generation
- Compliance and regulatory report formatting
- Scheduled report automation

**Data Retrieved via S3**:
- Employee profile data
- Report templates

**Output**: Generated Report, Executive Summary, Data Visualizations, Distribution List

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/ai_assistant\` |
| **Max Response Time** | \`30 seconds\` |`,
              },
              {
                id: 'ai-assistant-architecture',
                title: 'Technical Architecture',
                content: `# Banking AI Assistant -- Technical Architecture

## Assessment Flow

\`\`\`diagram:ai-assistant-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:ai-assistant-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/ai_assistant/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py              # AIAssistantSettings
    │   ├── models.py              # Pydantic schemas (shared)
    │   ├── orchestrator.py        # AIAssistantOrchestrator
    │   └── agents/
    │       ├── task_router.py
    │       ├── data_lookup_agent.py
    │       └── report_generator.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── task_router.py
            ├── data_lookup_agent.py
            └── report_generator.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "employee_id": "EMP001",
  "request_type": "full",
  "additional_context": "Generate Q4 lending report"
}
\`\`\`

**request_type options**: \`full\`, \`task_routing\`, \`data_lookup\`, \`report_generation\`

### Response Schema

\`\`\`json
{
  "employee_id": "EMP001",
  "assistant_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "task_classification": "report_generation",
  "result": {
    "report_title": "Q4 Lending Activity Summary",
    "sections": ["Executive Summary", "Loan Volume", "Risk Metrics"],
    "format": "PDF"
  },
  "summary": "Q4 lending report generated with 3 sections.",
  "raw_analysis": {
    "routing_result": { "..." : "..." },
    "lookup_result": { "..." : "..." },
    "report_result": { "..." : "..." }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|---------|
| \`profile\` | \`samples/ai_assistant/{employee_id}/profile.json\` | All agents |
| \`task_config\` | \`samples/ai_assistant/{employee_id}/task_config.json\` | Task Router |
| \`data_sources\` | \`samples/ai_assistant/{employee_id}/data_sources.json\` | Data Lookup Agent |
| \`report_templates\` | \`samples/ai_assistant/{employee_id}/report_templates.json\` | Report Generator |`,
              },
              {
                id: 'ai-assistant-deployment',
                title: 'Deployment & Testing',
                content: `# Banking AI Assistant -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:ai-assistant-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Banking** -> **AI Assistant**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`ai-assistant-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=ai_assistant \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=ai_assistant \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|---------|
| ECR Repository | Container image for AI Assistant agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample employee data and report templates |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Employee ID | Description | Expected Output |
|-------------|-------------|----------------|
| EMP001 | Relationship manager requesting lending report | Generated PDF report with Q4 metrics |
| EMP002 | Operations analyst requesting transaction data | Structured data lookup with summaries |

## Testing the Deployed Runtime

### Full Assistance
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "employee_id": "EMP001",
  "request_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/ai_assistant/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/ai_assistant/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'corporate-sales',
            title: 'Corporate Sales',
            children: [
              {
                id: 'corporate-sales-business',
                title: 'Business & Agent Design',
                content: `# Corporate Sales -- Business & Agent Design

## Business Overview

The Corporate Sales application automates lead scoring, opportunity analysis, and pitch preparation for corporate banking sales teams. It coordinates specialist agents to evaluate prospects, assess deal opportunities, and generate tailored pitch materials for relationship managers.

## Processing Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Pipeline** | Complete lead scoring + opportunity analysis + pitch | All agents in sequence |
| **Lead Scoring** | Prospect evaluation and prioritization | Lead Scorer |
| **Opportunity Analysis** | Deal assessment and win probability | Opportunity Analyst |
| **Pitch Preparation** | Customized presentation and materials | Pitch Preparer |

## Agent Design

### Orchestrator -- Corporate Sales Supervisor

Coordinates specialist agents in a sales pipeline: score leads, analyze opportunities, and prepare pitches. Produces comprehensive sales intelligence for relationship managers.

Considers:
- Lead quality and conversion probability
- Opportunity size and strategic fit
- Competitive landscape and differentiation
- Client-specific customization requirements

### Lead Scorer Agent

Specializes in prospect evaluation and lead prioritization.

**Responsibilities**:
- Financial profile analysis and scoring
- Industry and market position assessment
- Relationship history and engagement tracking
- Cross-sell and wallet share opportunity sizing
- Lead priority ranking and queue management

**Data Retrieved via S3**:
- Prospect profile data
- Industry data

**Output**: Lead Score (0-100), Priority Ranking, Key Opportunities, Engagement Recommendation

### Opportunity Analyst Agent

Specializes in deal assessment and pipeline analysis.

**Responsibilities**:
- Revenue potential estimation
- Win probability calculation
- Competitive analysis and positioning
- Deal structure recommendation
- Risk assessment and mitigation strategies

**Data Retrieved via S3**:
- Prospect profile data
- Market data

**Output**: Opportunity Score, Win Probability, Revenue Estimate, Deal Strategy

### Pitch Preparer Agent

Specializes in customized presentation and materials generation.

**Responsibilities**:
- Client-specific value proposition development
- Product and service matching to client needs
- Presentation deck content generation
- Case study and reference selection
- Pricing proposal preparation

**Data Retrieved via S3**:
- Prospect profile data
- Product catalog

**Output**: Pitch Deck Content, Value Propositions, Pricing Recommendations, Case Studies

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/corporate_sales\` |
| **Lead Score Threshold** | \`70\` |
| **Win Probability Target** | \`0.6\` |`,
              },
              {
                id: 'corporate-sales-architecture',
                title: 'Technical Architecture',
                content: `# Corporate Sales -- Technical Architecture

## Assessment Flow

\`\`\`diagram:corporate-sales-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:corporate-sales-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/corporate_sales/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py              # CorporateSalesSettings
    │   ├── models.py              # Pydantic schemas (shared)
    │   ├── orchestrator.py        # CorporateSalesOrchestrator
    │   └── agents/
    │       ├── lead_scorer.py
    │       ├── opportunity_analyst.py
    │       └── pitch_preparer.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── lead_scorer.py
            ├── opportunity_analyst.py
            └── pitch_preparer.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "prospect_id": "PROS001",
  "pipeline_type": "full",
  "additional_context": "Q4 expansion opportunity"
}
\`\`\`

**pipeline_type options**: \`full\`, \`lead_scoring\`, \`opportunity_analysis\`, \`pitch_preparation\`

### Response Schema

\`\`\`json
{
  "prospect_id": "PROS001",
  "sales_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "lead_score": {
    "score": 85,
    "priority": "high",
    "key_opportunities": ["Treasury management", "FX hedging"]
  },
  "opportunity": {
    "win_probability": 0.72,
    "revenue_estimate": 450000,
    "deal_strategy": "Consultative approach with treasury focus"
  },
  "pitch": {
    "value_propositions": ["Integrated treasury platform", "Competitive FX rates"],
    "recommended_products": ["Cash Management Suite", "FX Forward Contracts"]
  },
  "summary": "High-priority prospect with strong treasury management opportunity.",
  "raw_analysis": {
    "lead_result": { "..." : "..." },
    "opportunity_result": { "..." : "..." },
    "pitch_result": { "..." : "..." }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|---------|
| \`profile\` | \`samples/corporate_sales/{prospect_id}/profile.json\` | All agents |
| \`industry\` | \`samples/corporate_sales/{prospect_id}/industry.json\` | Lead Scorer |
| \`market\` | \`samples/corporate_sales/{prospect_id}/market.json\` | Opportunity Analyst |
| \`products\` | \`samples/corporate_sales/{prospect_id}/products.json\` | Pitch Preparer |`,
              },
              {
                id: 'corporate-sales-deployment',
                title: 'Deployment & Testing',
                content: `# Corporate Sales -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:corporate-sales-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Banking** -> **Corporate Sales**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`corporate-sales-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=corporate_sales \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=corporate_sales \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|---------|
| ECR Repository | Container image for Corporate Sales agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample prospect and market data |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Prospect ID | Description | Expected Output |
|-------------|-------------|----------------|
| PROS001 | Large manufacturing company, treasury needs | Lead score 85+, high win probability |
| PROS002 | Mid-market tech company, growth stage | Lead score 60-70, moderate opportunity |

## Testing the Deployed Runtime

### Full Pipeline
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "prospect_id": "PROS001",
  "pipeline_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/corporate_sales/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/corporate_sales/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'agentic-commerce',
            title: 'Agentic Commerce',
            children: [
              {
                id: 'agentic-commerce-business',
                title: 'Business & Agent Design',
                content: `# Agentic Commerce -- Business & Agent Design

## Business Overview

The Agentic Commerce application powers AI-driven offer engines, fulfillment automation, and product matching for banking products. It coordinates specialist agents to generate personalized offers, manage fulfillment workflows, and match customers with optimal financial products.

## Processing Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Commerce** | Complete offer + fulfillment + matching | All agents in sequence |
| **Offer Generation** | Personalized offer creation and pricing | Offer Engine |
| **Fulfillment** | Order processing and delivery management | Fulfillment Agent |
| **Product Matching** | Customer-product fit analysis | Product Matcher |

## Agent Design

### Orchestrator -- Commerce Supervisor

Coordinates specialist agents to deliver end-to-end commerce experiences for banking products. Manages the lifecycle from offer generation through fulfillment.

Considers:
- Customer eligibility and risk profile
- Offer competitiveness and profitability
- Fulfillment capacity and timelines
- Regulatory compliance for product offers

### Offer Engine Agent

Specializes in personalized offer creation and dynamic pricing.

**Responsibilities**:
- Customer profile analysis for offer targeting
- Dynamic pricing based on risk and relationship
- Promotional offer generation and bundling
- Offer validity and compliance verification
- A/B testing support for offer variants

**Data Retrieved via S3**:
- Customer profile data
- Pricing configuration

**Output**: Personalized Offers, Pricing Details, Eligibility Status, Offer Validity

### Fulfillment Agent

Specializes in order processing and delivery management.

**Responsibilities**:
- Application processing and validation
- Document collection and verification
- Account provisioning and setup
- Welcome kit and card delivery tracking
- Fulfillment status communication

**Data Retrieved via S3**:
- Customer profile data
- Fulfillment configuration

**Output**: Fulfillment Status, Processing Steps, Delivery Timeline, Required Actions

### Product Matcher Agent

Specializes in customer-product fit analysis and recommendations.

**Responsibilities**:
- Needs assessment based on customer profile
- Product feature matching and comparison
- Bundle optimization for multi-product offers
- Competitive positioning analysis
- Upgrade and migration path identification

**Data Retrieved via S3**:
- Customer profile data
- Product catalog

**Output**: Product Recommendations, Fit Scores, Bundle Options, Migration Paths

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/agentic_commerce\` |
| **Offer Validity** | \`30 days\` |
| **Match Confidence Threshold** | \`0.75\` |`,
              },
              {
                id: 'agentic-commerce-architecture',
                title: 'Technical Architecture',
                content: `# Agentic Commerce -- Technical Architecture

## Assessment Flow

\`\`\`diagram:agentic-commerce-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:agentic-commerce-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/agentic_commerce/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py              # AgenticCommerceSettings
    │   ├── models.py              # Pydantic schemas (shared)
    │   ├── orchestrator.py        # AgenticCommerceOrchestrator
    │   └── agents/
    │       ├── offer_engine.py
    │       ├── fulfillment_agent.py
    │       └── product_matcher.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── offer_engine.py
            ├── fulfillment_agent.py
            └── product_matcher.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "customer_id": "CUST001",
  "commerce_type": "full",
  "additional_context": "Interested in premium banking products"
}
\`\`\`

**commerce_type options**: \`full\`, \`offer_generation\`, \`fulfillment\`, \`product_matching\`

### Response Schema

\`\`\`json
{
  "customer_id": "CUST001",
  "commerce_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "offers": [
    {
      "product": "Premium Checking",
      "pricing": "No monthly fee for 12 months",
      "eligibility": "approved"
    }
  ],
  "product_matches": [
    {
      "product": "Premium Checking",
      "fit_score": 0.92,
      "reasons": ["High balance", "Frequent transactions"]
    }
  ],
  "summary": "3 personalized offers generated with high product fit.",
  "raw_analysis": {
    "offer_result": { "..." : "..." },
    "fulfillment_result": { "..." : "..." },
    "matching_result": { "..." : "..." }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|---------|
| \`profile\` | \`samples/agentic_commerce/{customer_id}/profile.json\` | All agents |
| \`pricing\` | \`samples/agentic_commerce/{customer_id}/pricing.json\` | Offer Engine |
| \`fulfillment\` | \`samples/agentic_commerce/{customer_id}/fulfillment.json\` | Fulfillment Agent |
| \`products\` | \`samples/agentic_commerce/{customer_id}/products.json\` | Product Matcher |`,
              },
              {
                id: 'agentic-commerce-deployment',
                title: 'Deployment & Testing',
                content: `# Agentic Commerce -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:agentic-commerce-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Banking** -> **Agentic Commerce**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`agentic-commerce-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=agentic_commerce \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=agentic_commerce \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|---------|
| ECR Repository | Container image for Agentic Commerce agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample customer and product data |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Customer ID | Description | Expected Output |
|-------------|-------------|----------------|
| CUST001 | High-value customer, premium product eligible | 3+ personalized offers, high fit scores |
| CUST002 | New customer, basic product segment | Entry-level offers, onboarding focus |

## Testing the Deployed Runtime

### Full Commerce
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "customer_id": "CUST001",
  "commerce_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/agentic_commerce/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/agentic_commerce/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
        ],
      },
      {
        id: 'risk-compliance',
        title: 'Risk & Compliance',
        children: [
          {
            id: 'fraud-detection',
            title: 'Fraud Detection',
            children: [
              {
                id: 'fraud-detection-business',
                title: 'Business & Agent Design',
                content: `# Fraud Detection -- Business & Agent Design

## Business Overview

The Fraud Detection application provides AI-powered fraud detection with real-time transaction monitoring, pattern analysis, and automated alert generation. It coordinates specialist agents to identify suspicious activities, analyze fraud patterns, and generate actionable alerts for fraud investigators and compliance officers.

## Monitoring Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Monitoring** | Complete transaction + pattern + alert analysis | All agents in parallel |
| **Transaction Monitoring** | Real-time transaction surveillance | Transaction Monitor |
| **Pattern Analysis** | Historical pattern and behavioral analysis | Pattern Analyst |
| **Alert Generation** | Risk scoring and alert compilation | Alert Generator |

## Agent Design

### Orchestrator -- Senior Fraud Detection Supervisor

Coordinates specialist agents and synthesizes their findings into a comprehensive fraud risk assessment. Ensures suspicious activities are detected, analyzed, and escalated appropriately.

Considers:
- Overall risk score and classification based on all agent findings
- Generated alerts with severity levels and supporting evidence
- Pattern analysis results indicating fraud typologies or behavioral anomalies
- Recommended investigation actions and escalation paths

### Transaction Monitor Agent

Specializes in real-time transaction surveillance and anomaly detection.

**Responsibilities**:
- Real-time transaction stream monitoring
- Velocity anomaly detection (unusual frequency or amounts)
- Geographic inconsistency identification
- Time-based pattern analysis (off-hours activity)
- Cross-account transaction linking

**Data Retrieved via S3**:
- Account profile data
- Transaction history

**Output**: Anomaly Flags, Velocity Metrics, Geographic Risk Indicators, Suspicious Transactions

### Pattern Analyst Agent

Specializes in historical fraud pattern recognition and behavioral analysis.

**Responsibilities**:
- Known fraud typology matching (account takeover, synthetic identity, card skimming)
- Behavioral deviation scoring against customer baseline
- Network analysis for coordinated fraud rings
- Temporal pattern identification
- Emerging fraud trend detection

**Data Retrieved via S3**:
- Account profile data
- Historical patterns

**Output**: Pattern Match Results, Behavioral Deviation Score, Network Links, Fraud Typology Classification

### Alert Generator Agent

Specializes in risk scoring, evidence compilation, and investigation recommendations.

**Responsibilities**:
- Composite risk score calculation
- Evidence package assembly for investigators
- Alert severity classification (LOW, MEDIUM, HIGH, CRITICAL)
- Investigation action recommendations
- Regulatory reporting trigger assessment (SAR filing)

**Data Retrieved via S3**:
- Account profile data
- Alert configuration

**Output**: Risk Score, Alert Severity, Evidence Package, Recommended Actions, SAR Trigger Assessment

## Risk Classification

| Risk Level | Score Range | Recommendation |
|-----------|-------------|----------------|
| **LOW** | 0-49 | Standard monitoring, no action required |
| **MEDIUM** | 50-74 | Enhanced monitoring, flag for review |
| **HIGH** | 75-89 | Immediate investigation, restrict account |
| **CRITICAL** | 90-100 | Block transactions, escalate to fraud team |

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/fraud_detection\` |
| **Risk Threshold (High)** | \`75\` |
| **Risk Threshold (Critical)** | \`90\` |
| **Alert Retention** | \`90 days\` |`,
              },
              {
                id: 'fraud-detection-architecture',
                title: 'Technical Architecture',
                content: `# Fraud Detection -- Technical Architecture

## Assessment Flow

\`\`\`diagram:fraud-detection-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:fraud-detection-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/fraud_detection/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py              # FraudDetectionSettings
    │   ├── models.py              # Pydantic schemas (shared)
    │   ├── orchestrator.py        # FraudDetectionOrchestrator
    │   └── agents/
    │       ├── transaction_monitor.py
    │       ├── pattern_analyst.py
    │       └── alert_generator.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── transaction_monitor.py
            ├── pattern_analyst.py
            └── alert_generator.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "customer_id": "ACCT001",
  "monitoring_type": "full",
  "additional_context": "Flagged by velocity rule"
}
\`\`\`

**monitoring_type options**: \`full\`, \`transaction_monitoring\`, \`pattern_analysis\`, \`alert_generation\`

### Response Schema

\`\`\`json
{
  "customer_id": "ACCT001",
  "monitoring_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "risk_assessment": {
    "score": 78,
    "level": "high",
    "factors": ["Unusual velocity", "Geographic anomaly"],
    "recommendations": ["Restrict online transactions", "Contact customer"]
  },
  "alerts": [
    {
      "alert_id": "ALERT-1",
      "severity": "high",
      "description": "Multiple transactions from different countries within 1 hour"
    }
  ],
  "summary": "High-risk activity detected. Recommend immediate investigation.",
  "raw_analysis": {
    "transaction_monitor": { "..." : "..." },
    "pattern_analyst": { "..." : "..." },
    "alert_generator": { "..." : "..." }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent risk scoring) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|---------|
| \`profile\` | \`samples/fraud_detection/{customer_id}/profile.json\` | All agents |
| \`transactions\` | \`samples/fraud_detection/{customer_id}/transactions.json\` | Transaction Monitor |
| \`patterns\` | \`samples/fraud_detection/{customer_id}/patterns.json\` | Pattern Analyst |
| \`alerts\` | \`samples/fraud_detection/{customer_id}/alerts.json\` | Alert Generator |`,
              },
              {
                id: 'fraud-detection-deployment',
                title: 'Deployment & Testing',
                content: `# Fraud Detection -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:fraud-detection-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Risk & Compliance** -> **Fraud Detection**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`fraud-detection-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=fraud_detection \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=fraud_detection \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|---------|
| ECR Repository | Container image for Fraud Detection agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample account data (profiles, transactions, patterns) |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Account ID | Description | Expected Risk | Expected Alerts |
|------------|-------------|--------------|----------------|
| ACCT001 | Account with velocity anomalies and geographic inconsistencies | HIGH (score ~78) | 2+ alerts, investigation recommended |
| ACCT002 | Normal transaction pattern, low-risk account | LOW (score ~15) | No alerts, standard monitoring |

## Testing the Deployed Runtime

### Full Monitoring
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "customer_id": "ACCT001",
  "monitoring_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Transaction Monitoring Only
\`\`\`bash
PAYLOAD=$(echo -n '{
  "customer_id": "ACCT002",
  "monitoring_type": "transaction_monitoring"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/fraud_detection/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/fraud_detection/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'document-processing',
            title: 'Document Processing',
            children: [
              {
                id: 'document-processing-business',
                title: 'Business & Agent Design',
                content: `# Document Processing -- Business & Agent Design

## Business Overview

The Document Processing application automates document classification, data extraction, and validation for compliance and operations workflows. It coordinates specialist agents to categorize incoming documents, extract structured data from unstructured content, and validate completeness and accuracy.

## Processing Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Processing** | Complete classification + extraction + validation | All agents in sequence |
| **Classification Only** | Document type identification and routing | Document Classifier |
| **Extraction Only** | Key field and data extraction | Data Extractor |
| **Validation Only** | Data quality and completeness checks | Validation Agent |

## Agent Design

### Orchestrator -- Document Processing Supervisor

Coordinates specialist agents in a sequential pipeline: classify the document, extract structured data, and validate the results. Produces a comprehensive processing report.

Considers:
- Document type and processing requirements
- Extraction accuracy and confidence levels
- Validation completeness and error identification
- Regulatory compliance requirements for document handling

### Document Classifier Agent

Specializes in document type identification and routing.

**Responsibilities**:
- Document type detection (loan applications, ID documents, financial statements)
- Multi-page document segmentation
- Language and format detection
- Processing priority assignment
- Routing to appropriate extraction pipeline

**Data Retrieved via S3**:
- Document data
- Classification rules

**Output**: Document Type, Confidence Score, Processing Priority, Routing Decision

### Data Extractor Agent

Specializes in structured data extraction from documents.

**Responsibilities**:
- Key field extraction (names, dates, amounts, account numbers)
- Table parsing and structured data generation
- Handwriting and signature detection
- Multi-format support (PDF, images, scanned documents)
- Extraction confidence scoring per field

**Data Retrieved via S3**:
- Document data
- Extraction templates

**Output**: Extracted Fields, Confidence Scores, Structured Data, Extraction Warnings

### Validation Agent

Specializes in data quality verification and completeness checks.

**Responsibilities**:
- Required field completeness verification
- Cross-field consistency checks
- Format and range validation
- Business rule application
- Exception flagging for manual review

**Data Retrieved via S3**:
- Document data
- Validation rules

**Output**: Validation Status, Errors Found, Warnings, Completeness Score

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/document_processing\` |
| **Classification Confidence** | \`0.85\` |
| **Extraction Confidence** | \`0.90\` |`,
              },
              {
                id: 'document-processing-architecture',
                title: 'Technical Architecture',
                content: `# Document Processing -- Technical Architecture

## Assessment Flow

\`\`\`diagram:document-processing-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:document-processing-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/document_processing/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py              # DocumentProcessingSettings
    │   ├── models.py              # Pydantic schemas (shared)
    │   ├── orchestrator.py        # DocumentProcessingOrchestrator
    │   └── agents/
    │       ├── document_classifier.py
    │       ├── data_extractor.py
    │       └── validation_agent.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── document_classifier.py
            ├── data_extractor.py
            └── validation_agent.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "document_id": "DOC001",
  "processing_type": "full",
  "additional_context": "Loan application package"
}
\`\`\`

**processing_type options**: \`full\`, \`classification_only\`, \`extraction_only\`, \`validation_only\`

### Response Schema

\`\`\`json
{
  "document_id": "DOC001",
  "processing_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "classification": {
    "type": "loan_application",
    "confidence": 0.97,
    "page_count": 12
  },
  "extraction": {
    "fields_extracted": 25,
    "confidence_avg": 0.93,
    "data": { "applicant_name": "...", "loan_amount": "..." }
  },
  "validation": {
    "status": "passed",
    "completeness": 0.96,
    "errors": 0,
    "warnings": 1
  },
  "summary": "Document classified and processed. 25 fields extracted with 96% completeness.",
  "raw_analysis": {
    "classification_result": { "..." : "..." },
    "extraction_result": { "..." : "..." },
    "validation_result": { "..." : "..." }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent extraction) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|---------|
| \`profile\` | \`samples/document_processing/{document_id}/profile.json\` | All agents |
| \`document\` | \`samples/document_processing/{document_id}/document.json\` | Document Classifier, Data Extractor |
| \`templates\` | \`samples/document_processing/{document_id}/templates.json\` | Data Extractor |
| \`validation_rules\` | \`samples/document_processing/{document_id}/validation_rules.json\` | Validation Agent |`,
              },
              {
                id: 'document-processing-deployment',
                title: 'Deployment & Testing',
                content: `# Document Processing -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:document-processing-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Risk & Compliance** -> **Document Processing**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`document-processing-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=document_processing \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=document_processing \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|---------|
| ECR Repository | Container image for Document Processing agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample document data (documents, templates, rules) |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Document ID | Description | Expected Output |
|-------------|-------------|----------------|
| DOC001 | Multi-page loan application package | Classified as loan_application, 25+ fields extracted, validation passed |
| DOC002 | Scanned ID document with handwriting | Classified as identity_document, key fields extracted with confidence scores |

## Testing the Deployed Runtime

### Full Processing
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "document_id": "DOC001",
  "processing_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/document_processing/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/document_processing/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'credit-risk',
            title: 'Credit Risk Assessment',
            children: [
              {
                id: 'credit-risk-business',
                title: 'Business & Agent Design',
                content: `# Credit Risk Assessment -- Business & Agent Design

## Business Overview

The Credit Risk Assessment application provides comprehensive credit risk evaluation for lending decisions. It coordinates specialist agents for financial analysis, risk scoring, and portfolio risk assessment to produce structured credit recommendations with risk-adjusted pricing guidance.

## Assessment Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Assessment** | Complete financial + risk + portfolio analysis | All agents in parallel |
| **Financial Analysis** | Income, debt, and asset evaluation | Financial Analyst |
| **Risk Scoring** | Probability of default and loss calculation | Risk Scorer |
| **Portfolio Analysis** | Portfolio-level risk and concentration | Portfolio Analyst |

## Agent Design

### Orchestrator -- Credit Risk Supervisor

Coordinates specialist agents and synthesizes their findings into a comprehensive credit risk assessment. Makes final lending recommendation: **APPROVE**, **DECLINE**, or **REFER**.

Considers:
- Combined financial health indicators across all dimensions
- Risk score calibration and model confidence
- Portfolio concentration and diversification impact
- Regulatory capital requirements and risk-weighted assets

### Financial Analyst Agent

Specializes in corporate financial statement analysis and creditworthiness evaluation.

**Responsibilities**:
- Income statement analysis (revenue trends, margin stability)
- Balance sheet evaluation (leverage ratios, liquidity metrics)
- Cash flow assessment (operating cash flow, debt service coverage)
- Industry peer comparison and benchmarking
- Financial projection and stress testing

**Data Retrieved via S3**:
- Customer profile data
- Financial statements

**Output**: Financial Health Score, Key Ratios, Trend Analysis, Peer Comparison

### Risk Scorer Agent

Specializes in credit risk quantification and probability modeling.

**Responsibilities**:
- Probability of Default (PD) calculation
- Loss Given Default (LGD) estimation
- Exposure at Default (EAD) computation
- Risk-weighted asset calculation
- Credit rating recommendation

**Data Retrieved via S3**:
- Customer profile data
- Credit history

**Output**: Risk Score (0-100), PD/LGD/EAD Metrics, Rating Recommendation, Risk Factors

### Portfolio Analyst Agent

Specializes in portfolio-level risk assessment and concentration analysis.

**Responsibilities**:
- Industry concentration analysis
- Geographic exposure assessment
- Single-name concentration limits
- Correlation and diversification metrics
- Portfolio stress testing scenarios

**Data Retrieved via S3**:
- Customer profile data
- Portfolio data

**Output**: Portfolio Impact Assessment, Concentration Metrics, Diversification Score, Stress Results

## Risk Classification

| Risk Level | Score Range | Recommendation |
|-----------|-------------|----------------|
| **LOW** | 0-49 | Approve -- standard terms and pricing |
| **MEDIUM** | 50-74 | Approve -- enhanced covenants, risk premium |
| **HIGH** | 75-89 | Refer -- manual review with conditions |
| **CRITICAL** | 90-100 | Decline -- risk exceeds appetite |

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/credit_risk\` |
| **Risk Threshold (High)** | \`75\` |
| **Risk Threshold (Critical)** | \`90\` |`,
              },
              {
                id: 'credit-risk-architecture',
                title: 'Technical Architecture',
                content: `# Credit Risk Assessment -- Technical Architecture

## Assessment Flow

\`\`\`diagram:credit-risk-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:credit-risk-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/credit_risk/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py              # CreditRiskSettings
    │   ├── models.py              # Pydantic schemas (shared)
    │   ├── orchestrator.py        # CreditRiskOrchestrator
    │   └── agents/
    │       ├── financial_analyst.py
    │       ├── risk_scorer.py
    │       └── portfolio_analyst.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── financial_analyst.py
            ├── risk_scorer.py
            └── portfolio_analyst.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "customer_id": "CUST001",
  "assessment_type": "full",
  "additional_context": "Commercial real estate loan application"
}
\`\`\`

**assessment_type options**: \`full\`, \`financial_analysis\`, \`risk_scoring\`, \`portfolio_analysis\`

### Response Schema

\`\`\`json
{
  "customer_id": "CUST001",
  "assessment_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "financial_analysis": {
    "health_score": 72,
    "key_ratios": { "debt_to_equity": 1.8, "current_ratio": 1.5 },
    "trend": "stable"
  },
  "risk_scoring": {
    "score": 45,
    "level": "low",
    "pd": 0.02,
    "lgd": 0.35,
    "rating": "BBB+"
  },
  "portfolio_impact": {
    "concentration_change": 0.3,
    "diversification_score": 0.78
  },
  "summary": "Moderate credit quality. Recommendation: APPROVE with standard terms.",
  "raw_analysis": {
    "financial_result": { "..." : "..." },
    "risk_result": { "..." : "..." },
    "portfolio_result": { "..." : "..." }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent risk scoring) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|---------|
| \`profile\` | \`samples/credit_risk/{customer_id}/profile.json\` | All agents |
| \`financials\` | \`samples/credit_risk/{customer_id}/financials.json\` | Financial Analyst |
| \`credit_history\` | \`samples/credit_risk/{customer_id}/credit_history.json\` | Risk Scorer |
| \`portfolio\` | \`samples/credit_risk/{customer_id}/portfolio.json\` | Portfolio Analyst |`,
              },
              {
                id: 'credit-risk-deployment',
                title: 'Deployment & Testing',
                content: `# Credit Risk Assessment -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:credit-risk-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Risk & Compliance** -> **Credit Risk Assessment**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`credit-risk-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=credit_risk \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=credit_risk \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|---------|
| ECR Repository | Container image for Credit Risk agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample credit data (profiles, financials, credit history) |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Customer ID | Description | Expected Risk | Expected Rating |
|-------------|-------------|--------------|----------------|
| CUST001 | Established manufacturer, strong financials | LOW (score ~45) | BBB+ |
| CUST002 | Startup with high leverage, thin credit history | HIGH (score ~80) | B |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "customer_id": "CUST001",
  "assessment_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/credit_risk/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/credit_risk/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'compliance-investigation',
            title: 'Compliance Investigation',
            children: [
              {
                id: 'compliance-investigation-business',
                title: 'Business & Agent Design',
                content: `# Compliance Investigation -- Business & Agent Design

## Business Overview

The Compliance Investigation application automates evidence gathering, pattern matching, and regulatory mapping for compliance investigations. It coordinates specialist agents to collect relevant evidence, identify violation patterns, and map findings to applicable regulatory frameworks.

## Investigation Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Investigation** | Complete evidence + pattern + regulatory analysis | All agents in parallel |
| **Evidence Gathering** | Data collection and evidence compilation | Evidence Gatherer |
| **Pattern Matching** | Violation pattern identification | Pattern Matcher |
| **Regulatory Mapping** | Regulatory framework application | Regulatory Mapper |

## Agent Design

### Orchestrator -- Compliance Investigation Supervisor

Coordinates specialist agents and synthesizes their findings into a comprehensive compliance investigation report. Determines investigation outcome and recommended regulatory actions.

Considers:
- Evidence completeness and chain of custody
- Pattern severity and frequency of violations
- Applicable regulations and enforcement actions
- Reporting obligations and deadlines

### Evidence Gatherer Agent

Specializes in evidence collection and documentation assembly.

**Responsibilities**:
- Transaction record retrieval and analysis
- Communication log collection (emails, chat, phone records)
- Document assembly and indexing
- Timeline reconstruction
- Evidence chain of custody maintenance

**Data Retrieved via S3**:
- Investigation profile data
- Evidence records

**Output**: Evidence Package, Timeline, Document Index, Chain of Custody Record

### Pattern Matcher Agent

Specializes in violation pattern identification and analysis.

**Responsibilities**:
- Known violation pattern matching
- Behavioral anomaly detection across actors
- Temporal and geographic pattern analysis
- Network analysis for coordinated activities
- Pattern severity classification

**Data Retrieved via S3**:
- Investigation profile data
- Pattern database

**Output**: Matched Patterns, Severity Scores, Actor Network, Pattern Timeline

### Regulatory Mapper Agent

Specializes in mapping findings to regulatory frameworks.

**Responsibilities**:
- Applicable regulation identification
- Violation classification per regulatory framework
- Penalty and enforcement action assessment
- Reporting requirement determination
- Remediation recommendation generation

**Data Retrieved via S3**:
- Investigation profile data
- Regulatory framework data

**Output**: Applicable Regulations, Violation Classifications, Penalty Assessment, Reporting Requirements

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/compliance_investigation\` |
| **Max Investigation Time** | \`60 seconds\` |
| **Evidence Retention** | \`7 years\` |`,
              },
              {
                id: 'compliance-investigation-architecture',
                title: 'Technical Architecture',
                content: `# Compliance Investigation -- Technical Architecture

## Assessment Flow

\`\`\`diagram:compliance-investigation-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:compliance-investigation-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/compliance_investigation/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py              # ComplianceInvestigationSettings
    │   ├── models.py              # Pydantic schemas (shared)
    │   ├── orchestrator.py        # ComplianceInvestigationOrchestrator
    │   └── agents/
    │       ├── evidence_gatherer.py
    │       ├── pattern_matcher.py
    │       └── regulatory_mapper.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── evidence_gatherer.py
            ├── pattern_matcher.py
            └── regulatory_mapper.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "case_id": "CASE001",
  "investigation_type": "full",
  "additional_context": "Suspicious transaction patterns flagged by monitoring"
}
\`\`\`

**investigation_type options**: \`full\`, \`evidence_gathering\`, \`pattern_matching\`, \`regulatory_mapping\`

### Response Schema

\`\`\`json
{
  "case_id": "CASE001",
  "investigation_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "evidence": {
    "documents_collected": 15,
    "timeline_entries": 28,
    "key_findings": ["Structured deposits below CTR threshold"]
  },
  "patterns": {
    "matched": ["structuring", "layering"],
    "severity": "high",
    "actors_identified": 3
  },
  "regulatory": {
    "applicable_regulations": ["BSA", "USA PATRIOT Act"],
    "violation_type": "structuring",
    "sar_required": true
  },
  "summary": "Investigation confirms structuring pattern. SAR filing required.",
  "raw_analysis": {
    "evidence_result": { "..." : "..." },
    "pattern_result": { "..." : "..." },
    "regulatory_result": { "..." : "..." }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent analysis) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|---------|
| \`profile\` | \`samples/compliance_investigation/{case_id}/profile.json\` | All agents |
| \`evidence\` | \`samples/compliance_investigation/{case_id}/evidence.json\` | Evidence Gatherer |
| \`patterns\` | \`samples/compliance_investigation/{case_id}/patterns.json\` | Pattern Matcher |
| \`regulations\` | \`samples/compliance_investigation/{case_id}/regulations.json\` | Regulatory Mapper |`,
              },
              {
                id: 'compliance-investigation-deployment',
                title: 'Deployment & Testing',
                content: `# Compliance Investigation -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:compliance-investigation-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Risk & Compliance** -> **Compliance Investigation**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`compliance-investigation-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=compliance_investigation \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=compliance_investigation \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|---------|
| ECR Repository | Container image for Compliance Investigation agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample investigation data (evidence, patterns, regulations) |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Case ID | Description | Expected Output |
|---------|-------------|----------------|
| CASE001 | Suspected structuring across multiple accounts | Pattern matched, SAR filing required |
| CASE002 | Routine compliance review, no anomalies | Clean report, standard monitoring continues |

## Testing the Deployed Runtime

### Full Investigation
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "case_id": "CASE001",
  "investigation_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/compliance_investigation/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/compliance_investigation/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'adverse-media',
            title: 'Adverse Media Screening',
            children: [
              {
                id: 'adverse-media-business',
                title: 'Business & Agent Design',
                content: `# Adverse Media Screening -- Business & Agent Design

## Business Overview

The Adverse Media Screening application automates media screening, sentiment analysis, and risk signal extraction for customer due diligence and ongoing monitoring. It coordinates specialist agents to scan media sources, analyze sentiment, and extract actionable risk signals for compliance teams.

## Screening Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Screening** | Complete media + sentiment + risk signal analysis | All agents in parallel |
| **Media Screening** | News and media source scanning | Media Screener |
| **Sentiment Analysis** | Content sentiment and tone evaluation | Sentiment Analyst |
| **Risk Extraction** | Risk signal identification and scoring | Risk Signal Extractor |

## Agent Design

### Orchestrator -- Adverse Media Supervisor

Coordinates specialist agents to perform comprehensive adverse media screening. Synthesizes findings into risk-rated media reports for compliance decision-making.

Considers:
- Media source credibility and recency
- Sentiment severity and consistency across sources
- Risk signal relevance to the entity being screened
- False positive probability and entity disambiguation

### Media Screener Agent

Specializes in media source scanning and content retrieval.

**Responsibilities**:
- News article and publication scanning
- Sanctions and watchlist database checks
- Court records and legal proceedings search
- Social media and public records review
- Source credibility assessment

**Data Retrieved via S3**:
- Entity profile data
- Media sources

**Output**: Media Hits, Source List, Publication Dates, Credibility Scores

### Sentiment Analyst Agent

Specializes in content sentiment analysis and risk tone evaluation.

**Responsibilities**:
- Article sentiment classification (positive, neutral, negative)
- Risk-specific sentiment scoring
- Contextual tone analysis for financial risk
- Multi-language sentiment processing
- Temporal sentiment trend analysis

**Data Retrieved via S3**:
- Entity profile data
- Sentiment models

**Output**: Sentiment Scores, Risk Tone Assessment, Trend Analysis, Language Breakdown

### Risk Signal Extractor Agent

Specializes in extracting actionable risk signals from screened content.

**Responsibilities**:
- Risk category identification (fraud, corruption, sanctions, litigation)
- Entity relationship extraction
- Risk severity scoring
- Actionable intelligence generation
- Alert trigger assessment

**Data Retrieved via S3**:
- Entity profile data
- Risk taxonomy

**Output**: Risk Signals, Severity Scores, Entity Relationships, Alert Triggers

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/adverse_media\` |
| **Max Screening Time** | \`60 seconds\` |
| **Sentiment Threshold** | \`-0.5\` |`,
              },
              {
                id: 'adverse-media-architecture',
                title: 'Technical Architecture',
                content: `# Adverse Media Screening -- Technical Architecture

## Assessment Flow

\`\`\`diagram:adverse-media-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:adverse-media-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/adverse_media/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py              # AdverseMediaSettings
    │   ├── models.py              # Pydantic schemas (shared)
    │   ├── orchestrator.py        # AdverseMediaOrchestrator
    │   └── agents/
    │       ├── media_screener.py
    │       ├── sentiment_analyst.py
    │       └── risk_signal_extractor.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── media_screener.py
            ├── sentiment_analyst.py
            └── risk_signal_extractor.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "entity_id": "ENT001",
  "screening_type": "full",
  "additional_context": "Annual KYC refresh screening"
}
\`\`\`

**screening_type options**: \`full\`, \`media_screening\`, \`sentiment_analysis\`, \`risk_extraction\`

### Response Schema

\`\`\`json
{
  "entity_id": "ENT001",
  "screening_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "media_hits": {
    "total": 12,
    "negative": 3,
    "sources": ["Reuters", "Bloomberg", "Court Records"]
  },
  "sentiment": {
    "overall_score": -0.3,
    "risk_tone": "moderate",
    "trend": "stable"
  },
  "risk_signals": [
    {
      "category": "litigation",
      "severity": "medium",
      "description": "Pending regulatory inquiry"
    }
  ],
  "summary": "Moderate adverse media exposure. 3 negative hits identified.",
  "raw_analysis": {
    "media_result": { "..." : "..." },
    "sentiment_result": { "..." : "..." },
    "risk_signal_result": { "..." : "..." }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent screening) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|---------|
| \`profile\` | \`samples/adverse_media/{entity_id}/profile.json\` | All agents |
| \`media_sources\` | \`samples/adverse_media/{entity_id}/media_sources.json\` | Media Screener |
| \`sentiment_data\` | \`samples/adverse_media/{entity_id}/sentiment_data.json\` | Sentiment Analyst |
| \`risk_taxonomy\` | \`samples/adverse_media/{entity_id}/risk_taxonomy.json\` | Risk Signal Extractor |`,
              },
              {
                id: 'adverse-media-deployment',
                title: 'Deployment & Testing',
                content: `# Adverse Media Screening -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:adverse-media-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Risk & Compliance** -> **Adverse Media Screening**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`adverse-media-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=adverse_media \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=adverse_media \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|---------|
| ECR Repository | Container image for Adverse Media agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample entity data (profiles, media sources, risk taxonomy) |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Entity ID | Description | Expected Output |
|-----------|-------------|----------------|
| ENT001 | Entity with moderate media exposure, pending litigation | 3 negative hits, moderate risk signals |
| ENT002 | Clean entity with no adverse media | No hits, clean screening report |

## Testing the Deployed Runtime

### Full Screening
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "entity_id": "ENT001",
  "screening_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/adverse_media/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/adverse_media/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'market-surveillance',
            title: 'Market Surveillance',
            children: [
              {
                id: 'market-surveillance-business',
                title: 'Business & Agent Design',
                content: `# Market Surveillance -- Business & Agent Design

## Business Overview

The Market Surveillance application automates trade pattern analysis, communication monitoring, and surveillance alert generation for detecting market manipulation, insider trading, and suspicious trading patterns. It coordinates specialist agents to analyze trading activity, monitor communications, and generate regulatory-grade surveillance alerts.

## Surveillance Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Surveillance** | Complete trade + communication + alert analysis | All agents in parallel |
| **Trade Analysis** | Trading pattern and anomaly detection | Trade Pattern Analyst |
| **Communication Monitoring** | Communication review for insider signals | Communication Monitor |
| **Alert Generation** | Surveillance alert creation and evidence | Surveillance Alert Generator |

## Agent Design

### Orchestrator -- Market Surveillance Supervisor

Coordinates specialist agents to detect and document potential market abuse. Synthesizes findings into regulatory-grade surveillance reports with enforcement recommendations.

Considers:
- Cross-reference between trading patterns and communications
- Severity of detected manipulation indicators
- Regulatory reporting obligations and deadlines
- Evidence quality for potential enforcement actions

### Trade Pattern Analyst Agent

Specializes in trading pattern analysis and manipulation detection.

**Responsibilities**:
- Layering and spoofing pattern detection
- Wash trading identification
- Momentum ignition analysis
- Front-running detection
- Unusual volume and timing analysis

**Data Retrieved via S3**:
- Trading profile data
- Trade history

**Output**: Pattern Matches, Manipulation Indicators, Anomaly Scores, Trading Timeline

### Communication Monitor Agent

Specializes in communication surveillance for insider trading signals.

**Responsibilities**:
- Email and chat communication analysis
- Keyword and phrase pattern matching
- Temporal correlation with trading activity
- Relationship mapping between communicators and traders
- Sentiment and intent analysis

**Data Retrieved via S3**:
- Trading profile data
- Communication logs

**Output**: Flagged Communications, Correlation Findings, Relationship Maps, Intent Assessment

### Surveillance Alert Generator Agent

Specializes in creating comprehensive surveillance alerts with evidence.

**Responsibilities**:
- Alert severity classification
- Evidence package compilation
- Regulatory report formatting (STR, suspicious activity)
- Investigation recommendation generation
- Alert deduplication and prioritization

**Data Retrieved via S3**:
- Trading profile data
- Alert configuration

**Output**: Surveillance Alerts, Evidence Packages, Regulatory Reports, Investigation Recommendations

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/market_surveillance\` |
| **Alert Retention** | \`7 years\` |
| **Pattern Confidence Threshold** | \`0.8\` |`,
              },
              {
                id: 'market-surveillance-architecture',
                title: 'Technical Architecture',
                content: `# Market Surveillance -- Technical Architecture

## Assessment Flow

\`\`\`diagram:market-surveillance-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:market-surveillance-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/market_surveillance/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py              # MarketSurveillanceSettings
    │   ├── models.py              # Pydantic schemas (shared)
    │   ├── orchestrator.py        # MarketSurveillanceOrchestrator
    │   └── agents/
    │       ├── trade_pattern_analyst.py
    │       ├── communication_monitor.py
    │       └── surveillance_alert_generator.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── trade_pattern_analyst.py
            ├── communication_monitor.py
            └── surveillance_alert_generator.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "trader_id": "TRADER001",
  "surveillance_type": "full",
  "additional_context": "Unusual options activity before earnings"
}
\`\`\`

**surveillance_type options**: \`full\`, \`trade_analysis\`, \`communication_monitoring\`, \`alert_generation\`

### Response Schema

\`\`\`json
{
  "trader_id": "TRADER001",
  "surveillance_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "trade_analysis": {
    "patterns_detected": ["unusual_options_volume"],
    "anomaly_score": 0.85,
    "timeline": "Heavy call buying 2 days before earnings"
  },
  "communications": {
    "flagged_messages": 3,
    "correlation_score": 0.72,
    "key_contacts": ["External analyst"]
  },
  "alerts": [
    {
      "type": "potential_insider_trading",
      "severity": "high",
      "evidence_strength": "moderate"
    }
  ],
  "summary": "Potential insider trading detected. Options activity correlated with external communications.",
  "raw_analysis": {
    "trade_result": { "..." : "..." },
    "communication_result": { "..." : "..." },
    "alert_result": { "..." : "..." }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-sonnet-4-20250514-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent surveillance) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|---------|
| \`profile\` | \`samples/market_surveillance/{trader_id}/profile.json\` | All agents |
| \`trades\` | \`samples/market_surveillance/{trader_id}/trades.json\` | Trade Pattern Analyst |
| \`communications\` | \`samples/market_surveillance/{trader_id}/communications.json\` | Communication Monitor |
| \`alerts\` | \`samples/market_surveillance/{trader_id}/alerts.json\` | Surveillance Alert Generator |`,
              },
              {
                id: 'market-surveillance-deployment',
                title: 'Deployment & Testing',
                content: `# Market Surveillance -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:market-surveillance-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Risk & Compliance** -> **Market Surveillance**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`market-surveillance-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=market_surveillance \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=market_surveillance \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|---------|
| ECR Repository | Container image for Market Surveillance agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample trading and communication data |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Trader ID | Description | Expected Output |
|-----------|-------------|----------------|
| TRADER001 | Unusual options activity before earnings, external communications | High-severity insider trading alert |
| TRADER002 | Normal trading patterns, no suspicious communications | Clean surveillance report |

## Testing the Deployed Runtime

### Full Surveillance
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "trader_id": "TRADER001",
  "surveillance_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/market_surveillance/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/market_surveillance/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
        ],
      },
      {
        id: 'capital-markets',
        title: 'Capital Markets',
        children: [
          {
            id: 'investment-advisory',
            title: 'Investment Advisory',
            children: [
              {
                id: 'investment-advisory-business',
                title: 'Business & Agent Design',
                content: `# Investment Advisory -- Business & Agent Design

## Business Overview

The Investment Advisory application provides personalized investment advice by coordinating portfolio analysis, market research, and client profiling agents. It produces tailored investment recommendations aligned with client risk profiles, financial goals, and market conditions.

## Advisory Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Advisory** | Complete portfolio + market + client analysis | All agents in parallel |
| **Portfolio Review** | Holdings analysis and performance attribution | Portfolio Analyst |
| **Market Research** | Market trends and opportunity identification | Market Researcher |
| **Client Profiling** | Risk tolerance and goals assessment | Client Profiler |

## Agent Design

### Orchestrator -- Investment Advisory Supervisor

Coordinates specialist agents and synthesizes their findings into personalized investment recommendations. Balances risk-return optimization with client suitability requirements.

Considers:
- Portfolio composition and performance against benchmarks
- Market conditions and investment opportunities
- Client risk tolerance and investment time horizon
- Regulatory suitability requirements

### Portfolio Analyst Agent

Specializes in portfolio analysis, performance attribution, and risk assessment.

**Responsibilities**:
- Holdings review and sector allocation analysis
- Performance attribution against benchmarks
- Risk metrics calculation (Sharpe, Sortino, VaR)
- Rebalancing opportunity identification
- Tax-loss harvesting candidates

**Data Retrieved via S3**:
- Client profile data
- Portfolio holdings

**Output**: Holdings Summary, Performance Metrics, Risk Analysis, Rebalancing Recommendations

### Market Researcher Agent

Specializes in market analysis, trend identification, and opportunity screening.

**Responsibilities**:
- Macro-economic environment assessment
- Sector rotation and theme identification
- Asset class relative value analysis
- Event-driven opportunity screening
- Risk factor monitoring

**Data Retrieved via S3**:
- Client profile data
- Market data

**Output**: Market Outlook, Sector Views, Investment Themes, Risk Factors

### Client Profiler Agent

Specializes in client risk profiling and suitability assessment.

**Responsibilities**:
- Risk tolerance questionnaire analysis
- Investment time horizon determination
- Financial goals and constraints mapping
- Suitability verification against regulations
- Client preference and restriction tracking

**Data Retrieved via S3**:
- Client profile data
- Client questionnaire

**Output**: Risk Profile, Suitability Score, Goals Summary, Constraints

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/investment_advisory\` |
| **Max Analysis Time** | \`60 seconds\` |
`,
              },
              {
                id: 'investment-advisory-architecture',
                title: 'Technical Architecture',
                content: `# Investment Advisory -- Technical Architecture

## Assessment Flow

\`\`\`diagram:investment-advisory-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:investment-advisory-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/investment_advisory/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── portfolio_analyst.py
    │       ├── market_researcher.py
    │       ├── client_profiler.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── portfolio_analyst.py
            ├── market_researcher.py
            ├── client_profiler.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "client_id": "CLI001",
  "advisory_type": "full",
  "additional_context": "Annual portfolio review"
}
\`\`\`

**advisory_type options**: \`full\`, \`portfolio_review\`, \`market_research\`, \`client_profiling\`

### Response Schema

\`\`\`json
{
  "client_id": "CLI001",
  "advisory_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "portfolio_analysis": {
    "total_value": 2500000,
    "ytd_return": 0.12,
    "risk_level": "moderate"
  },
  "recommendations": [
    {"action": "Rebalance", "asset": "International Equities", "target": "15%"}
  ],
  "summary": "Portfolio performing well. Minor rebalancing recommended.",
  "raw_analysis": {
    "portfolio_result": { "..." : "..." },
    "market_result": { "..." : "..." },
    "client_result": { "..." : "..." }
  }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/investment_advisory/{client_id}/profile.json\` | All agents |
| \`portfolio\` | \`samples/investment_advisory/{client_id}/portfolio.json\` | Portfolio Analyst |
| \`market_data\` | \`samples/investment_advisory/{client_id}/market_data.json\` | Market Researcher |
| \`questionnaire\` | \`samples/investment_advisory/{client_id}/questionnaire.json\` | Client Profiler |
`,
              },
              {
                id: 'investment-advisory-deployment',
                title: 'Deployment & Testing',
                content: `# Investment Advisory -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:investment-advisory-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Capital Markets** -> **Investment Advisory**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`investment-advisory-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=investment_advisory \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=investment_advisory \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Investment Advisory agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for investment-advisory |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Client ID | Description | Expected Output |
|---|---|---|
| CLI001 | High-net-worth client, moderate risk, diversified portfolio | Rebalancing recommendations with market outlook |
| CLI002 | Growth-oriented client, aggressive risk profile | Equity-heavy recommendations with sector themes |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "client_id": "CLI001",
  "advisory_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/investment_advisory/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/investment_advisory/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'earnings-summarization',
            title: 'Earnings Summarization',
            children: [
              {
                id: 'earnings-summarization-business',
                title: 'Business & Agent Design',
                content: `# Earnings Summarization -- Business & Agent Design

## Business Overview

The Earnings Summarization application automates earnings call transcript processing, metric extraction, and sentiment analysis for equity research. It coordinates specialist agents to parse earnings calls, extract financial metrics, and assess management sentiment to produce structured research summaries.

## Processing Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Summarization** | Complete transcript + metrics + sentiment analysis | All agents in sequence |
| **Transcript Processing** | Call transcript parsing and structuring | Transcript Processor |
| **Metric Extraction** | Financial metric identification and tracking | Metric Extractor |
| **Sentiment Analysis** | Management tone and confidence assessment | Sentiment Analyst |

## Agent Design

### Orchestrator -- Earnings Research Supervisor

Coordinates specialist agents in a sequential pipeline to produce comprehensive earnings summaries. Ensures accuracy of extracted metrics and consistency of sentiment assessment.

Considers:
- Revenue and earnings versus consensus estimates
- Guidance changes and management outlook
- Key business drivers and segment performance
- Management tone and confidence indicators

### Transcript Processor Agent

Specializes in earnings call transcript parsing and structuring.

**Responsibilities**:
- Speaker identification and attribution
- Q&A section segmentation
- Key theme extraction from prepared remarks
- Forward-looking statement identification
- Comparison with prior quarter commentary

**Data Retrieved via S3**:
- Transcript data
- Company profile

**Output**: Structured Transcript, Key Themes, Speaker Segments, Forward Statements

### Metric Extractor Agent

Specializes in financial metric identification and comparison.

**Responsibilities**:
- Revenue, EPS, and margin extraction
- Beat/miss calculation versus consensus
- Guidance extraction and comparison
- Segment-level metric breakdown
- Year-over-year and quarter-over-quarter comparison

**Data Retrieved via S3**:
- Transcript data
- Financial data

**Output**: Extracted Metrics, Beat/Miss Analysis, Guidance Summary, Segment Breakdown

### Sentiment Analyst Agent

Specializes in management tone and confidence assessment.

**Responsibilities**:
- Management sentiment scoring
- Confidence level assessment on guidance
- Risk language identification
- Tone comparison versus prior quarters
- Bull/bear signal extraction

**Data Retrieved via S3**:
- Transcript data
- Sentiment models

**Output**: Sentiment Score, Confidence Level, Risk Signals, Tone Trend

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/earnings_summarization\` |
| **Sentiment Confidence** | \`0.80\` |
`,
              },
              {
                id: 'earnings-summarization-architecture',
                title: 'Technical Architecture',
                content: `# Earnings Summarization -- Technical Architecture

## Assessment Flow

\`\`\`diagram:earnings-summarization-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:earnings-summarization-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/earnings_summarization/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── transcript_processor.py
    │       ├── metric_extractor.py
    │       ├── sentiment_analyst.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── transcript_processor.py
            ├── metric_extractor.py
            ├── sentiment_analyst.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "company_id": "COMP001",
  "processing_type": "full",
  "additional_context": "Q4 2024 earnings call"
}
\`\`\`

**processing_type options**: \`full\`, \`transcript_processing\`, \`metric_extraction\`, \`sentiment_analysis\`

### Response Schema

\`\`\`json
{
  "company_id": "COMP001",
  "summary_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "metrics": {
    "revenue": {"actual": 5200000000, "estimate": 5100000000, "beat": true},
    "eps": {"actual": 2.45, "estimate": 2.30, "beat": true}
  },
  "sentiment": {
    "overall": 0.72,
    "confidence_on_guidance": "high",
    "tone": "optimistic"
  },
  "summary": "Strong Q4 beat on revenue and EPS. Management raised FY25 guidance.",
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/earnings_summarization/{company_id}/profile.json\` | All agents |
| \`transcript\` | \`samples/earnings_summarization/{company_id}/transcript.json\` | Transcript Processor |
| \`financials\` | \`samples/earnings_summarization/{company_id}/financials.json\` | Metric Extractor |
| \`sentiment_models\` | \`samples/earnings_summarization/{company_id}/sentiment_models.json\` | Sentiment Analyst |
`,
              },
              {
                id: 'earnings-summarization-deployment',
                title: 'Deployment & Testing',
                content: `# Earnings Summarization -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:earnings-summarization-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Capital Markets** -> **Earnings Summarization**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`earnings-summarization-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=earnings_summarization \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=earnings_summarization \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Earnings Summarization agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for earnings-summarization |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Company ID | Description | Expected Output |
|---|---|---|
| COMP001 | Large-cap tech company, Q4 earnings beat | Revenue/EPS beat, positive sentiment, guidance raised |
| COMP002 | Financial services firm, mixed results | Revenue miss, EPS beat, cautious guidance |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "company_id": "COMP001",
  "processing_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/earnings_summarization/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/earnings_summarization/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'economic-research',
            title: 'Economic Research',
            children: [
              {
                id: 'economic-research-business',
                title: 'Business & Agent Design',
                content: `# Economic Research -- Business & Agent Design

## Business Overview

The Economic Research application automates data aggregation, trend analysis, and research report writing for economic research teams. It coordinates specialist agents to gather economic indicators, identify trends, and produce structured research publications.

## Research Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Research** | Complete data + trends + report generation | All agents in sequence |
| **Data Aggregation** | Economic indicator collection and compilation | Data Aggregator |
| **Trend Analysis** | Pattern identification and forecasting | Trend Analyst |
| **Research Writing** | Report generation and publication | Research Writer |

## Agent Design

### Orchestrator -- Economic Research Supervisor

Coordinates specialist agents to produce comprehensive economic research reports. Ensures data accuracy, analytical rigor, and publication-ready output.

Considers:
- Data source reliability and recency
- Trend significance and confidence levels
- Cross-indicator consistency and correlations
- Publication standards and formatting requirements

### Data Aggregator Agent

Specializes in economic data collection and compilation.

**Responsibilities**:
- Macro-economic indicator retrieval (GDP, CPI, employment)
- Central bank policy data collection
- Market data aggregation (yields, spreads, FX)
- Survey data compilation (PMI, consumer confidence)
- Data quality validation and normalization

**Data Retrieved via S3**:
- Research profile
- Economic databases

**Output**: Aggregated Indicators, Data Quality Report, Time Series, Source Attribution

### Trend Analyst Agent

Specializes in economic trend identification and forecasting.

**Responsibilities**:
- Trend identification across economic indicators
- Leading/lagging indicator analysis
- Recession probability modeling
- Correlation and causation analysis
- Scenario modeling and stress testing

**Data Retrieved via S3**:
- Research profile
- Historical trends

**Output**: Trend Analysis, Forecasts, Scenario Models, Correlation Matrix

### Research Writer Agent

Specializes in economic research report generation.

**Responsibilities**:
- Executive summary generation
- Chart and table creation guidance
- Investment implications formulation
- Risk factor articulation
- Publication formatting and compliance

**Data Retrieved via S3**:
- Research profile
- Report templates

**Output**: Research Report, Executive Summary, Investment Implications, Charts

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/economic_research\` |
| **Trend Confidence** | \`0.75\` |
`,
              },
              {
                id: 'economic-research-architecture',
                title: 'Technical Architecture',
                content: `# Economic Research -- Technical Architecture

## Assessment Flow

\`\`\`diagram:economic-research-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:economic-research-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/economic_research/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── data_aggregator.py
    │       ├── trend_analyst.py
    │       ├── research_writer.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── data_aggregator.py
            ├── trend_analyst.py
            ├── research_writer.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "research_id": "RES001",
  "research_type": "full",
  "additional_context": "Monthly economic outlook"
}
\`\`\`

**research_type options**: \`full\`, \`data_aggregation\`, \`trend_analysis\`, \`research_writing\`

### Response Schema

\`\`\`json
{
  "research_id": "RES001",
  "report_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "indicators": {
    "gdp_growth": 2.3,
    "inflation": 3.1,
    "unemployment": 3.8
  },
  "trends": {
    "primary": "Soft landing trajectory",
    "confidence": 0.78
  },
  "summary": "Economic indicators suggest continued moderate growth.",
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/economic_research/{research_id}/profile.json\` | All agents |
| \`indicators\` | \`samples/economic_research/{research_id}/indicators.json\` | Data Aggregator |
| \`trends\` | \`samples/economic_research/{research_id}/trends.json\` | Trend Analyst |
| \`templates\` | \`samples/economic_research/{research_id}/templates.json\` | Research Writer |
`,
              },
              {
                id: 'economic-research-deployment',
                title: 'Deployment & Testing',
                content: `# Economic Research -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:economic-research-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Capital Markets** -> **Economic Research**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`economic-research-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=economic_research \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=economic_research \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Economic Research agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for economic-research |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Research ID | Description | Expected Output |
|---|---|---|
| RES001 | Monthly macro-economic outlook report | Structured report with GDP, inflation, employment trends |
| RES002 | Sector-specific economic analysis | Industry-focused report with sector indicators |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "research_id": "RES001",
  "research_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/economic_research/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/economic_research/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'email-triage',
            title: 'Email Triage',
            children: [
              {
                id: 'email-triage-business',
                title: 'Business & Agent Design',
                content: `# Email Triage -- Business & Agent Design

## Business Overview

The Email Triage application automates email classification and action extraction for trading desks and capital markets operations. It coordinates specialist agents to categorize incoming emails by urgency and type, then extract actionable items for immediate processing.

## Processing Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Triage** | Complete classification + action extraction | Both agents in sequence |
| **Classification Only** | Email categorization and priority assignment | Email Classifier |
| **Action Extraction** | Actionable item identification and routing | Action Extractor |

## Agent Design

### Orchestrator -- Email Triage Supervisor

Coordinates specialist agents to process incoming emails efficiently. Ensures urgent items are identified and routed immediately while maintaining accurate categorization.

Considers:
- Email urgency and time sensitivity
- Action item completeness and clarity
- Routing accuracy to correct desk or team
- Regulatory email handling requirements

### Email Classifier Agent

Specializes in email categorization and priority assignment.

**Responsibilities**:
- Intent classification (trade instruction, research, client request, operational)
- Urgency assessment based on content and sender
- Regulatory classification (compliance-related, material non-public)
- Topic tagging and keyword extraction
- Duplicate and thread detection

**Data Retrieved via S3**:
- Email data
- Classification rules

**Output**: Email Category, Urgency Level, Regulatory Flags, Topic Tags

### Action Extractor Agent

Specializes in identifying and structuring actionable items.

**Responsibilities**:
- Trade instruction extraction (buy/sell, quantity, price, timing)
- Deadline identification and tracking
- Approval request detection
- Follow-up action identification
- Responsible party assignment

**Data Retrieved via S3**:
- Email data
- Action templates

**Output**: Action Items, Deadlines, Assignments, Trade Instructions

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/email_triage\` |
| **Urgency Threshold** | \`0.7\` |
| **Classification Confidence** | \`0.8\` |
`,
              },
              {
                id: 'email-triage-architecture',
                title: 'Technical Architecture',
                content: `# Email Triage -- Technical Architecture

## Assessment Flow

\`\`\`diagram:email-triage-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:email-triage-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/email_triage/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── email_classifier.py
    │       ├── action_extractor.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── email_classifier.py
            ├── action_extractor.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "email_id": "EMAIL001",
  "triage_type": "full",
  "additional_context": "Trading desk inbox"
}
\`\`\`

**triage_type options**: \`full\`, \`classification_only\`, \`action_extraction\`

### Response Schema

\`\`\`json
{
  "email_id": "EMAIL001",
  "triage_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "classification": {
    "category": "trade_instruction",
    "urgency": "high",
    "regulatory_flag": false
  },
  "actions": [
    {"type": "execute_trade", "details": "Buy 1000 AAPL at market", "deadline": "EOD"}
  ],
  "summary": "Trade instruction identified. High urgency, EOD deadline.",
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/email_triage/{email_id}/profile.json\` | Both agents |
| \`email\` | \`samples/email_triage/{email_id}/email.json\` | Email Classifier |
| \`action_templates\` | \`samples/email_triage/{email_id}/action_templates.json\` | Action Extractor |
`,
              },
              {
                id: 'email-triage-deployment',
                title: 'Deployment & Testing',
                content: `# Email Triage -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:email-triage-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Capital Markets** -> **Email Triage**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`email-triage-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=email_triage \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=email_triage \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Email Triage agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for email-triage |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Email ID | Description | Expected Output |
|---|---|---|
| EMAIL001 | Trade instruction email with EOD deadline | Classified as trade_instruction, high urgency |
| EMAIL002 | Research distribution email, low urgency | Classified as research, standard processing |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "email_id": "EMAIL001",
  "triage_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/email_triage/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/email_triage/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'trading-assistant',
            title: 'Trading Assistant',
            children: [
              {
                id: 'trading-assistant-business',
                title: 'Business & Agent Design',
                content: `# Trading Assistant -- Business & Agent Design

## Business Overview

The Trading Assistant application provides AI-powered market analysis, trade idea generation, and execution planning for traders. It coordinates specialist agents to analyze market conditions, generate trade ideas with risk-reward profiles, and plan optimal execution strategies.

## Analysis Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Analysis** | Complete market + ideas + execution planning | All agents in sequence |
| **Market Analysis** | Market conditions and regime assessment | Market Analyst |
| **Idea Generation** | Trade opportunity identification | Trade Idea Generator |
| **Execution Planning** | Optimal execution strategy design | Execution Planner |

## Agent Design

### Orchestrator -- Trading Supervisor

Coordinates specialist agents to provide comprehensive trading support. Ensures trade ideas are market-aware and execution plans minimize market impact.

Considers:
- Market regime and volatility environment
- Trade idea risk-reward and conviction level
- Execution timing and venue selection
- Portfolio-level risk and concentration impact

### Market Analyst Agent

Specializes in market conditions assessment and regime identification.

**Responsibilities**:
- Price action and technical analysis
- Volume and liquidity assessment
- Market regime classification (trending, ranging, volatile)
- Cross-asset correlation analysis
- Event risk calendar monitoring

**Data Retrieved via S3**:
- Trading profile
- Market data

**Output**: Market Regime, Technical Levels, Liquidity Assessment, Event Risks

### Trade Idea Generator Agent

Specializes in trade opportunity identification and structuring.

**Responsibilities**:
- Alpha signal identification
- Risk-reward profile calculation
- Entry and exit level determination
- Position sizing recommendation
- Catalyst identification and timing

**Data Retrieved via S3**:
- Trading profile
- Signal data

**Output**: Trade Ideas, Risk-Reward Profiles, Entry/Exit Levels, Position Sizes

### Execution Planner Agent

Specializes in trade execution optimization.

**Responsibilities**:
- Venue selection and routing
- Timing strategy (TWAP, VWAP, IS)
- Market impact estimation
- Slippage minimization
- Execution benchmark selection

**Data Retrieved via S3**:
- Trading profile
- Execution data

**Output**: Execution Strategy, Venue Selection, Impact Estimate, Benchmark

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/trading_assistant\` |
| **Market Impact Threshold** | \`0.05\` |
`,
              },
              {
                id: 'trading-assistant-architecture',
                title: 'Technical Architecture',
                content: `# Trading Assistant -- Technical Architecture

## Assessment Flow

\`\`\`diagram:trading-assistant-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:trading-assistant-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/trading_assistant/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── market_analyst.py
    │       ├── trade_idea_generator.py
    │       ├── execution_planner.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── market_analyst.py
            ├── trade_idea_generator.py
            ├── execution_planner.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "trader_id": "TRADE001",
  "analysis_type": "full",
  "additional_context": "Looking for equity opportunities"
}
\`\`\`

**analysis_type options**: \`full\`, \`market_analysis\`, \`idea_generation\`, \`execution_planning\`

### Response Schema

\`\`\`json
{
  "trader_id": "TRADE001",
  "analysis_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "market_regime": "trending_bullish",
  "ideas": [
    {"ticker": "AAPL", "direction": "long", "conviction": "high", "risk_reward": 3.2}
  ],
  "execution": {
    "strategy": "VWAP",
    "estimated_impact": 0.02,
    "timeline": "2 hours"
  },
  "summary": "Bullish market regime. High-conviction long AAPL idea with VWAP execution.",
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/trading_assistant/{trader_id}/profile.json\` | All agents |
| \`market_data\` | \`samples/trading_assistant/{trader_id}/market_data.json\` | Market Analyst |
| \`signals\` | \`samples/trading_assistant/{trader_id}/signals.json\` | Trade Idea Generator |
| \`execution_data\` | \`samples/trading_assistant/{trader_id}/execution_data.json\` | Execution Planner |
`,
              },
              {
                id: 'trading-assistant-deployment',
                title: 'Deployment & Testing',
                content: `# Trading Assistant -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:trading-assistant-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Capital Markets** -> **Trading Assistant**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`trading-assistant-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=trading_assistant \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=trading_assistant \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Trading Assistant agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for trading-assistant |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Trader ID | Description | Expected Output |
|---|---|---|
| TRADE001 | Active equity trader, large-cap focus | Market regime + trade ideas + execution plan |
| TRADE002 | Options trader, volatility strategies | Volatility analysis + options strategies |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "trader_id": "TRADE001",
  "analysis_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/trading_assistant/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/trading_assistant/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'research-credit-memo',
            title: 'Research Credit Memo',
            children: [
              {
                id: 'research-credit-memo-business',
                title: 'Business & Agent Design',
                content: `# Research Credit Memo -- Business & Agent Design

## Business Overview

The Research Credit Memo application automates credit research memo generation for fixed income analysis. It coordinates specialist agents to gather financial data, perform credit analysis, and produce publication-ready credit research memoranda.

## Processing Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Memo** | Complete data + analysis + memo generation | All agents in sequence |
| **Data Gathering** | Financial data collection and compilation | Data Gatherer |
| **Credit Analysis** | Credit quality assessment and rating | Credit Analyst |
| **Memo Writing** | Structured memo generation | Memo Writer |

## Agent Design

### Orchestrator -- Credit Research Supervisor

Coordinates specialist agents to produce comprehensive credit research memos. Ensures analytical rigor and publication-quality output.

Considers:
- Data completeness and source reliability
- Credit analysis consistency with methodology
- Memo structure and compliance with standards
- Investment recommendation clarity

### Data Gatherer Agent

Specializes in financial data collection for credit analysis.

**Responsibilities**:
- Financial statement retrieval and normalization
- Bond pricing and spread data collection
- Rating agency report compilation
- Comparable issuer data gathering
- Covenant and legal document review

**Data Retrieved via S3**:
- Issuer profile
- Financial databases

**Output**: Financial Data Package, Comparable Set, Covenant Summary, Market Data

### Credit Analyst Agent

Specializes in credit quality assessment and rating recommendation.

**Responsibilities**:
- Financial ratio analysis and trend evaluation
- Cash flow adequacy and debt service coverage
- Business risk assessment and competitive position
- Recovery analysis and structural considerations
- Rating recommendation with rationale

**Data Retrieved via S3**:
- Issuer profile
- Credit history

**Output**: Credit Assessment, Rating Recommendation, Key Risks, Recovery Analysis

### Memo Writer Agent

Specializes in structured credit memo generation.

**Responsibilities**:
- Investment thesis formulation
- Risk factor articulation
- Comparative analysis presentation
- Recommendation and price target
- Publication formatting and compliance

**Data Retrieved via S3**:
- Issuer profile
- Memo templates

**Output**: Credit Memo, Investment Thesis, Risk Factors, Recommendation

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/research_credit_memo\` |
| **Credit Confidence** | \`0.7\` |
`,
              },
              {
                id: 'research-credit-memo-architecture',
                title: 'Technical Architecture',
                content: `# Research Credit Memo -- Technical Architecture

## Assessment Flow

\`\`\`diagram:research-credit-memo-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:research-credit-memo-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/research_credit_memo/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── data_gatherer.py
    │       ├── credit_analyst.py
    │       ├── memo_writer.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── data_gatherer.py
            ├── credit_analyst.py
            ├── memo_writer.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "issuer_id": "ISS001",
  "memo_type": "full",
  "additional_context": "New issue analysis"
}
\`\`\`

**memo_type options**: \`full\`, \`data_gathering\`, \`credit_analysis\`, \`memo_writing\`

### Response Schema

\`\`\`json
{
  "issuer_id": "ISS001",
  "memo_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "credit_assessment": {
    "rating_recommendation": "BBB+",
    "outlook": "stable",
    "key_strengths": ["Strong cash flow", "Market leader"]
  },
  "recommendation": "Buy at current spread levels",
  "summary": "Investment grade credit with stable outlook. Attractive relative value.",
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/research_credit_memo/{issuer_id}/profile.json\` | All agents |
| \`financials\` | \`samples/research_credit_memo/{issuer_id}/financials.json\` | Data Gatherer |
| \`credit_history\` | \`samples/research_credit_memo/{issuer_id}/credit_history.json\` | Credit Analyst |
| \`templates\` | \`samples/research_credit_memo/{issuer_id}/templates.json\` | Memo Writer |
`,
              },
              {
                id: 'research-credit-memo-deployment',
                title: 'Deployment & Testing',
                content: `# Research Credit Memo -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:research-credit-memo-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Capital Markets** -> **Research Credit Memo**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`research-credit-memo-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=research_credit_memo \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=research_credit_memo \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Research Credit Memo agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for research-credit-memo |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Issuer ID | Description | Expected Output |
|---|---|---|
| ISS001 | Investment-grade industrial issuer, new bond issue | BBB+ rating, buy recommendation |
| ISS002 | High-yield retail issuer, refinancing | BB- rating, hold recommendation |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "issuer_id": "ISS001",
  "memo_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/research_credit_memo/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/research_credit_memo/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'investment-management',
            title: 'Investment Management',
            children: [
              {
                id: 'investment-management-business',
                title: 'Business & Agent Design',
                content: `# Investment Management -- Business & Agent Design

## Business Overview

The Investment Management application automates allocation optimization, portfolio rebalancing, and performance attribution for investment management teams. It coordinates specialist agents to optimize asset allocation, execute rebalancing trades, and attribute portfolio performance.

## Management Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Management** | Complete optimization + rebalancing + attribution | All agents in sequence |
| **Allocation Optimization** | Strategic and tactical allocation | Allocation Optimizer |
| **Rebalancing** | Trade generation and execution | Rebalancing Agent |
| **Performance Attribution** | Return decomposition and analysis | Performance Attributor |

## Agent Design

### Orchestrator -- Investment Management Supervisor

Coordinates specialist agents to manage investment portfolios. Ensures optimal allocation, timely rebalancing, and accurate performance reporting.

Considers:
- Target allocation versus current drift
- Rebalancing cost-benefit analysis
- Performance attribution accuracy
- Regulatory and client mandate compliance

### Allocation Optimizer Agent

Specializes in strategic and tactical asset allocation.

**Responsibilities**:
- Mean-variance optimization
- Risk parity and factor-based allocation
- Tactical overlay for market views
- Constraint optimization (limits, restrictions)
- Scenario analysis and stress testing

**Data Retrieved via S3**:
- Portfolio data
- Market data

**Output**: Optimal Allocation, Efficient Frontier, Scenario Results, Constraint Impact

### Rebalancing Agent

Specializes in portfolio rebalancing and trade generation.

**Responsibilities**:
- Drift detection and threshold monitoring
- Trade list generation for rebalancing
- Tax-loss harvesting opportunity identification
- Transaction cost minimization
- Cash flow management and reinvestment

**Data Retrieved via S3**:
- Portfolio data
- Trade data

**Output**: Trade List, Cost Estimate, Tax Impact, Rebalancing Schedule

### Performance Attributor Agent

Specializes in return decomposition and performance analysis.

**Responsibilities**:
- Brinson attribution (allocation, selection, interaction)
- Factor-based return decomposition
- Risk-adjusted performance metrics
- Benchmark relative analysis
- Fee impact and net-of-fee reporting

**Data Retrieved via S3**:
- Portfolio data
- Benchmark data

**Output**: Attribution Report, Factor Decomposition, Risk Metrics, Benchmark Comparison

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/investment_management\` |
| **Rebalance Threshold** | \`0.02\` |
`,
              },
              {
                id: 'investment-management-architecture',
                title: 'Technical Architecture',
                content: `# Investment Management -- Technical Architecture

## Assessment Flow

\`\`\`diagram:investment-management-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:investment-management-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/investment_management/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── allocation_optimizer.py
    │       ├── rebalancing_agent.py
    │       ├── performance_attributor.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── allocation_optimizer.py
            ├── rebalancing_agent.py
            ├── performance_attributor.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "portfolio_id": "PORT001",
  "management_type": "full",
  "additional_context": "Quarterly rebalancing cycle"
}
\`\`\`

**management_type options**: \`full\`, \`allocation_optimization\`, \`rebalancing\`, \`performance_attribution\`

### Response Schema

\`\`\`json
{
  "portfolio_id": "PORT001",
  "management_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "allocation": {
    "equities": 0.60,
    "fixed_income": 0.30,
    "alternatives": 0.10
  },
  "rebalancing": {
    "trades_needed": 5,
    "estimated_cost": 1200,
    "tax_harvest_savings": 8500
  },
  "attribution": {
    "total_return": 0.034,
    "allocation_effect": 0.012,
    "selection_effect": 0.022
  },
  "summary": "Portfolio rebalanced. Q1 return 3.4%, outperforming benchmark by 0.8%.",
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/investment_management/{portfolio_id}/profile.json\` | All agents |
| \`portfolio\` | \`samples/investment_management/{portfolio_id}/portfolio.json\` | Allocation Optimizer |
| \`trades\` | \`samples/investment_management/{portfolio_id}/trades.json\` | Rebalancing Agent |
| \`benchmark\` | \`samples/investment_management/{portfolio_id}/benchmark.json\` | Performance Attributor |
`,
              },
              {
                id: 'investment-management-deployment',
                title: 'Deployment & Testing',
                content: `# Investment Management -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:investment-management-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Capital Markets** -> **Investment Management**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`investment-management-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=investment_management \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=investment_management \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Investment Management agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for investment-management |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Portfolio ID | Description | Expected Output |
|---|---|---|
| PORT001 | Balanced portfolio, quarterly rebalancing cycle | 5 trades, positive attribution, benchmark outperformance |
| PORT002 | Growth portfolio, monthly monitoring | Allocation optimization with tax harvesting |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "portfolio_id": "PORT001",
  "management_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/investment_management/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/investment_management/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'data-analytics',
            title: 'Data Analytics',
            children: [
              {
                id: 'data-analytics-business',
                title: 'Business & Agent Design',
                content: `# Data Analytics -- Business & Agent Design

## Business Overview

The Data Analytics application provides conversational data exploration, statistical analysis, and insight generation for capital markets teams. It coordinates specialist agents to explore datasets, perform statistical analysis, and generate actionable business insights.

## Analytics Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Analytics** | Complete exploration + analysis + insights | All agents in sequence |
| **Data Exploration** | Dataset profiling and visualization | Data Explorer |
| **Statistical Analysis** | Quantitative analysis and modeling | Statistical Analyst |
| **Insight Generation** | Business insight and narrative creation | Insight Generator |

## Agent Design

### Orchestrator -- Data Analytics Supervisor

Coordinates specialist agents to deliver comprehensive data analytics. Ensures statistical rigor and actionable insight generation.

Considers:
- Data quality and completeness
- Statistical significance and confidence
- Business relevance of insights
- Visualization clarity and accuracy

### Data Explorer Agent

Specializes in dataset profiling, exploration, and visualization.

**Responsibilities**:
- Dataset profiling and summary statistics
- Distribution analysis and outlier detection
- Correlation and relationship discovery
- Time series decomposition
- Interactive visualization generation

**Data Retrieved via S3**:
- Analytics profile
- Data sources

**Output**: Data Profile, Distributions, Correlations, Visualizations

### Statistical Analyst Agent

Specializes in quantitative analysis and statistical modeling.

**Responsibilities**:
- Hypothesis testing and significance analysis
- Regression and predictive modeling
- Cluster analysis and segmentation
- Anomaly detection and root cause analysis
- Confidence interval and uncertainty quantification

**Data Retrieved via S3**:
- Analytics profile
- Statistical models

**Output**: Statistical Results, Model Outputs, Significance Tests, Predictions

### Insight Generator Agent

Specializes in translating analysis into business insights.

**Responsibilities**:
- Key finding identification and ranking
- Business narrative generation
- Actionable recommendation formulation
- Risk and opportunity assessment
- Executive summary creation

**Data Retrieved via S3**:
- Analytics profile
- Insight templates

**Output**: Business Insights, Recommendations, Executive Summary, Action Items

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/data_analytics\` |
| **Correlation Threshold** | \`0.7\` |
`,
              },
              {
                id: 'data-analytics-architecture',
                title: 'Technical Architecture',
                content: `# Data Analytics -- Technical Architecture

## Assessment Flow

\`\`\`diagram:data-analytics-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:data-analytics-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/data_analytics/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── data_explorer.py
    │       ├── statistical_analyst.py
    │       ├── insight_generator.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── data_explorer.py
            ├── statistical_analyst.py
            ├── insight_generator.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "dataset_id": "DATA001",
  "analytics_type": "full",
  "additional_context": "Analyze trading volume patterns"
}
\`\`\`

**analytics_type options**: \`full\`, \`data_exploration\`, \`statistical_analysis\`, \`insight_generation\`

### Response Schema

\`\`\`json
{
  "dataset_id": "DATA001",
  "analytics_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "exploration": {
    "rows": 50000,
    "columns": 25,
    "quality_score": 0.95
  },
  "analysis": {
    "key_correlations": [{"var1": "volume", "var2": "volatility", "r": 0.82}],
    "anomalies_detected": 3
  },
  "insights": ["Trading volume spikes precede volatility by 2 days"],
  "summary": "Strong volume-volatility correlation identified with predictive value.",
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/data_analytics/{dataset_id}/profile.json\` | All agents |
| \`data_sources\` | \`samples/data_analytics/{dataset_id}/data_sources.json\` | Data Explorer |
| \`models\` | \`samples/data_analytics/{dataset_id}/models.json\` | Statistical Analyst |
| \`templates\` | \`samples/data_analytics/{dataset_id}/templates.json\` | Insight Generator |
`,
              },
              {
                id: 'data-analytics-deployment',
                title: 'Deployment & Testing',
                content: `# Data Analytics -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:data-analytics-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Capital Markets** -> **Data Analytics**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`data-analytics-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=data_analytics \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=data_analytics \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Data Analytics agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for data-analytics |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Dataset ID | Description | Expected Output |
|---|---|---|
| DATA001 | Trading volume and volatility dataset | Volume-volatility correlation, predictive insights |
| DATA002 | Client transaction patterns | Segmentation analysis, behavioral insights |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "dataset_id": "DATA001",
  "analytics_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/data_analytics/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/data_analytics/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'trading-insights',
            title: 'Trading Insights',
            children: [
              {
                id: 'trading-insights-business',
                title: 'Business & Agent Design',
                content: `# Trading Insights -- Business & Agent Design

## Business Overview

The Trading Insights application provides signal generation, cross-asset analysis, and scenario modeling for trading insights. It coordinates specialist agents to generate trading signals, analyze cross-asset relationships, and model market scenarios.

## Analysis Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Insights** | Complete signal + cross-asset + scenario analysis | All agents in parallel |
| **Signal Generation** | Trading signal identification and scoring | Signal Generator |
| **Cross-Asset Analysis** | Multi-asset correlation and relative value | Cross Asset Analyst |
| **Scenario Modeling** | Market scenario construction and impact | Scenario Modeler |

## Agent Design

### Orchestrator -- Trading Insights Supervisor

Coordinates specialist agents to produce comprehensive trading insights. Synthesizes signals, cross-asset views, and scenarios into actionable trading intelligence.

Considers:
- Signal strength and historical accuracy
- Cross-asset consistency and divergences
- Scenario probability and impact assessment
- Risk-adjusted opportunity sizing

### Signal Generator Agent

Specializes in trading signal identification and scoring.

**Responsibilities**:
- Technical signal generation (momentum, mean reversion, breakout)
- Fundamental signal extraction (earnings, flows, positioning)
- Sentiment signal construction (options, news, social)
- Signal combination and ensemble scoring
- Historical backtesting and hit rate tracking

**Data Retrieved via S3**:
- Trading profile
- Signal data

**Output**: Active Signals, Strength Scores, Hit Rates, Ensemble Score

### Cross Asset Analyst Agent

Specializes in multi-asset analysis and relative value.

**Responsibilities**:
- Cross-asset correlation monitoring
- Relative value identification
- Macro regime impact on asset classes
- Flow analysis across markets
- Divergence detection and mean-reversion signals

**Data Retrieved via S3**:
- Trading profile
- Market data

**Output**: Cross-Asset Views, Relative Value Trades, Correlation Matrix, Divergences

### Scenario Modeler Agent

Specializes in market scenario construction and impact assessment.

**Responsibilities**:
- Scenario definition and probability assignment
- Portfolio impact modeling per scenario
- Stress testing across extreme scenarios
- Tail risk quantification
- Hedging strategy evaluation

**Data Retrieved via S3**:
- Trading profile
- Scenario data

**Output**: Scenario Set, Impact Analysis, Stress Results, Hedge Recommendations

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/trading_insights\` |
| **Signal Confidence Threshold** | \`0.65\` |
`,
              },
              {
                id: 'trading-insights-architecture',
                title: 'Technical Architecture',
                content: `# Trading Insights -- Technical Architecture

## Assessment Flow

\`\`\`diagram:trading-insights-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:trading-insights-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/trading_insights/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── signal_generator.py
    │       ├── cross_asset_analyst.py
    │       ├── scenario_modeler.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── signal_generator.py
            ├── cross_asset_analyst.py
            ├── scenario_modeler.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "portfolio_id": "PORT001",
  "analysis_type": "full",
  "additional_context": "Weekly trading insights update"
}
\`\`\`

**analysis_type options**: \`full\`, \`signal_generation\`, \`cross_asset_analysis\`, \`scenario_modeling\`

### Response Schema

\`\`\`json
{
  "portfolio_id": "PORT001",
  "insights_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "signals": [
    {"asset": "SPX", "direction": "long", "strength": 0.78, "type": "momentum"}
  ],
  "cross_asset": {
    "key_divergence": "Equity-credit spread divergence widening",
    "relative_value": "EM over DM equities"
  },
  "scenarios": [
    {"name": "Rate cut rally", "probability": 0.35, "impact": "+3.2%"}
  ],
  "summary": "Bullish signals across equities. Key risk: credit spread divergence.",
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/trading_insights/{portfolio_id}/profile.json\` | All agents |
| \`signals\` | \`samples/trading_insights/{portfolio_id}/signals.json\` | Signal Generator |
| \`market_data\` | \`samples/trading_insights/{portfolio_id}/market_data.json\` | Cross Asset Analyst |
| \`scenarios\` | \`samples/trading_insights/{portfolio_id}/scenarios.json\` | Scenario Modeler |
`,
              },
              {
                id: 'trading-insights-deployment',
                title: 'Deployment & Testing',
                content: `# Trading Insights -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:trading-insights-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Capital Markets** -> **Trading Insights**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`trading-insights-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=trading_insights \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=trading_insights \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Trading Insights agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for trading-insights |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Portfolio ID | Description | Expected Output |
|---|---|---|
| PORT001 | Multi-asset portfolio, weekly insights cycle | Active signals + cross-asset views + scenario analysis |
| PORT002 | Fixed income portfolio, rate-focused | Rate signals + credit relative value + rate scenarios |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "portfolio_id": "PORT001",
  "analysis_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/trading_insights/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/trading_insights/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
        ],
      },
      {
        id: 'insurance',
        title: 'Insurance',
        children: [
          {
            id: 'claims-management',
            title: 'Claims Management',
            children: [
              {
                id: 'claims-management-business',
                title: 'Business & Agent Design',
                content: `# Claims Management -- Business & Agent Design

## Business Overview

The Claims Management application automates insurance claims processing with intake, damage assessment, and settlement recommendation. It coordinates specialist agents to collect claim information, evaluate damages, and recommend appropriate settlements.

## Processing Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Processing** | Complete intake + assessment + settlement | All agents in sequence |
| **Claims Intake** | Information collection and categorization | Claims Intake Agent |
| **Damage Assessment** | Loss evaluation and coverage determination | Damage Assessor |
| **Settlement** | Payout calculation and recommendation | Settlement Recommender |

## Agent Design

### Orchestrator -- Claims Supervisor

Coordinates specialist agents in a claims processing pipeline. Ensures accurate assessment and fair settlement recommendations.

Considers:
- Claim validity and documentation completeness
- Damage assessment accuracy and coverage verification
- Settlement fairness and policy compliance
- Fraud indicators and investigation triggers

### Claims Intake Agent

Specializes in claim information collection and initial categorization.

**Responsibilities**:
- Claim registration and documentation collection
- Policy coverage verification
- Initial categorization (auto, property, liability, health)
- Priority and urgency assessment
- Fraud indicator screening

**Data Retrieved via S3**:
- Claim data
- Policy data

**Output**: Claim Record, Coverage Status, Category, Priority, Fraud Flags

### Damage Assessor Agent

Specializes in loss evaluation and coverage determination.

**Responsibilities**:
- Physical damage evaluation and cost estimation
- Coverage limit and deductible calculation
- Repair versus replacement determination
- Third-party liability assessment
- Depreciation and actual cash value computation

**Data Retrieved via S3**:
- Claim data
- Assessment data

**Output**: Damage Report, Cost Estimate, Coverage Analysis, Repair/Replace Decision

### Settlement Recommender Agent

Specializes in settlement calculation and recommendation.

**Responsibilities**:
- Settlement amount calculation based on assessment
- Payment schedule and method recommendation
- Subrogation opportunity identification
- Customer communication drafting
- Approval workflow routing based on authority limits

**Data Retrieved via S3**:
- Claim data
- Settlement rules

**Output**: Settlement Amount, Payment Terms, Subrogation Status, Approval Path

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/claims_management\` |
| **Auto-Approve Limit** | \`$5,000\` |
| **Assessment Confidence** | \`0.9\` |
`,
              },
              {
                id: 'claims-management-architecture',
                title: 'Technical Architecture',
                content: `# Claims Management -- Technical Architecture

## Assessment Flow

\`\`\`diagram:claims-management-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:claims-management-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/claims_management/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── claims_intake_agent.py
    │       ├── damage_assessor.py
    │       ├── settlement_recommender.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── claims_intake_agent.py
            ├── damage_assessor.py
            ├── settlement_recommender.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "claim_id": "CLM001",
  "processing_type": "full",
  "additional_context": "Auto collision claim"
}
\`\`\`

**processing_type options**: \`full\`, \`claims_intake\`, \`damage_assessment\`, \`settlement\`

### Response Schema

\`\`\`json
{
  "claim_id": "CLM001",
  "processing_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "intake": {
    "category": "auto_collision",
    "priority": "standard",
    "coverage_verified": true
  },
  "assessment": {
    "damage_estimate": 8500,
    "deductible": 1000,
    "decision": "repair"
  },
  "settlement": {
    "amount": 7500,
    "method": "direct_deposit",
    "approval_required": false
  },
  "summary": "Auto collision claim processed. Settlement of $7,500 approved.",
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/claims_management/{claim_id}/profile.json\` | All agents |
| \`claim\` | \`samples/claims_management/{claim_id}/claim.json\` | Claims Intake Agent |
| \`assessment\` | \`samples/claims_management/{claim_id}/assessment.json\` | Damage Assessor |
| \`settlement_rules\` | \`samples/claims_management/{claim_id}/settlement_rules.json\` | Settlement Recommender |
`,
              },
              {
                id: 'claims-management-deployment',
                title: 'Deployment & Testing',
                content: `# Claims Management -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:claims-management-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Insurance** -> **Claims Management**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`claims-management-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=claims_management \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=claims_management \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Claims Management agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for claims-management |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Claim ID | Description | Expected Output |
|---|---|---|
| CLM001 | Standard auto collision, clear liability | $7,500 settlement, auto-approved |
| CLM002 | Complex property damage, disputed liability | Assessment pending, manual review required |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "claim_id": "CLM001",
  "processing_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/claims_management/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/claims_management/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'life-insurance-agent',
            title: 'Life Insurance Agent',
            children: [
              {
                id: 'life-insurance-agent-business',
                title: 'Business & Agent Design',
                content: `# Life Insurance Agent -- Business & Agent Design

## Business Overview

The Life Insurance Agent application provides AI-powered needs analysis, product matching, and underwriting assistance for life insurance. It coordinates specialist agents to assess coverage needs, recommend suitable products, and guide applicants through underwriting preparation.

## Service Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Service** | Complete needs + matching + underwriting | All agents in sequence |
| **Needs Analysis** | Coverage needs and financial goals assessment | Needs Analyst |
| **Product Matching** | Policy and rider selection | Product Matcher |
| **Underwriting Prep** | Application and medical preparation | Underwriting Assistant |

## Agent Design

### Orchestrator -- Life Insurance Supervisor

Coordinates specialist agents to provide comprehensive life insurance advisory. Ensures appropriate coverage recommendations and smooth underwriting preparation.

Considers:
- Coverage adequacy for beneficiary protection
- Product suitability and cost-effectiveness
- Underwriting risk factors and preparation
- Regulatory compliance and disclosure requirements

### Needs Analyst Agent

Specializes in coverage needs assessment and financial planning.

**Responsibilities**:
- Income replacement calculation
- Debt coverage and estate planning needs
- Education funding requirements
- Retirement income gap analysis
- Existing coverage evaluation and gap identification

**Data Retrieved via S3**:
- Client profile
- Financial data

**Output**: Coverage Need, Income Analysis, Gap Assessment, Recommended Amount

### Product Matcher Agent

Specializes in policy selection and rider recommendations.

**Responsibilities**:
- Term vs. permanent insurance comparison
- Product feature matching to client needs
- Rider selection (waiver of premium, accelerated death benefit)
- Premium comparison across carriers
- Conversion and portability options

**Data Retrieved via S3**:
- Client profile
- Product catalog

**Output**: Product Recommendations, Premium Estimates, Rider Options, Carrier Comparison

### Underwriting Assistant Agent

Specializes in application preparation and underwriting guidance.

**Responsibilities**:
- Health questionnaire preparation assistance
- Medical exam scheduling and preparation
- Documentation checklist generation
- Risk class estimation
- Application review and completeness verification

**Data Retrieved via S3**:
- Client profile
- Underwriting guidelines

**Output**: Application Checklist, Risk Class Estimate, Medical Requirements, Preparation Guide

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/life_insurance_agent\` |
| **Underwriting Confidence** | \`0.75\` |
`,
              },
              {
                id: 'life-insurance-agent-architecture',
                title: 'Technical Architecture',
                content: `# Life Insurance Agent -- Technical Architecture

## Assessment Flow

\`\`\`diagram:life-insurance-agent-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:life-insurance-agent-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/life_insurance_agent/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── needs_analyst.py
    │       ├── product_matcher.py
    │       ├── underwriting_assistant.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── needs_analyst.py
            ├── product_matcher.py
            ├── underwriting_assistant.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "client_id": "LI001",
  "service_type": "full",
  "additional_context": "Young family, primary earner"
}
\`\`\`

**service_type options**: \`full\`, \`needs_analysis\`, \`product_matching\`, \`underwriting_prep\`

### Response Schema

\`\`\`json
{
  "client_id": "LI001",
  "service_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "needs": {
    "recommended_coverage": 1500000,
    "income_replacement_years": 20,
    "debt_coverage": 350000
  },
  "products": [
    {"type": "20-year term", "coverage": 1500000, "monthly_premium": 85}
  ],
  "underwriting": {
    "estimated_risk_class": "preferred",
    "medical_exam_required": true
  },
  "summary": "Recommended $1.5M 20-year term policy. Preferred risk class estimated.",
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/life_insurance_agent/{client_id}/profile.json\` | All agents |
| \`financial\` | \`samples/life_insurance_agent/{client_id}/financial.json\` | Needs Analyst |
| \`products\` | \`samples/life_insurance_agent/{client_id}/products.json\` | Product Matcher |
| \`underwriting\` | \`samples/life_insurance_agent/{client_id}/underwriting.json\` | Underwriting Assistant |
`,
              },
              {
                id: 'life-insurance-agent-deployment',
                title: 'Deployment & Testing',
                content: `# Life Insurance Agent -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:life-insurance-agent-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Insurance** -> **Life Insurance Agent**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`life-insurance-agent-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=life_insurance_agent \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=life_insurance_agent \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Life Insurance Agent agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for life-insurance-agent |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Client ID | Description | Expected Output |
|---|---|---|
| LI001 | Young family, primary earner, no existing coverage | $1.5M term recommendation, preferred risk class |
| LI002 | Pre-retiree, estate planning focus | Permanent policy recommendation, standard risk class |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "client_id": "LI001",
  "service_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/life_insurance_agent/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/life_insurance_agent/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'customer-engagement',
            title: 'Customer Engagement',
            children: [
              {
                id: 'customer-engagement-business',
                title: 'Business & Agent Design',
                content: `# Customer Engagement -- Business & Agent Design

## Business Overview

The Customer Engagement application provides AI-powered customer engagement for insurance to improve retention through churn prediction, personalized outreach, and policy optimization. It coordinates specialist agents to predict at-risk customers, design targeted outreach campaigns, and recommend policy adjustments.

## Engagement Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Engagement** | Complete churn + outreach + optimization | All agents in sequence |
| **Churn Prediction** | At-risk customer identification | Churn Predictor |
| **Outreach Planning** | Personalized campaign design | Outreach Agent |
| **Policy Optimization** | Coverage and pricing adjustment | Policy Optimizer |

## Agent Design

### Orchestrator -- Customer Engagement Supervisor

Coordinates specialist agents to maximize customer retention through proactive engagement. Synthesizes churn risk, outreach strategies, and policy adjustments into comprehensive retention plans.

Considers:
- Churn probability and contributing factors
- Outreach channel and timing optimization
- Policy adjustment impact on retention
- Customer lifetime value considerations

### Churn Predictor Agent

Specializes in customer churn risk assessment and prediction.

**Responsibilities**:
- Behavioral signal analysis (claim frequency, payment patterns)
- Customer satisfaction indicator monitoring
- Life event detection (move, marriage, retirement)
- Competitive offer detection
- Churn probability scoring and risk ranking

**Data Retrieved via S3**:
- Policy profile
- Behavioral data

**Output**: Churn Probability, Risk Factors, Life Events, Risk Ranking

### Outreach Agent

Specializes in personalized outreach campaign design.

**Responsibilities**:
- Channel preference identification (email, phone, app)
- Message personalization based on risk factors
- Optimal timing determination
- Offer and incentive selection
- Campaign effectiveness tracking

**Data Retrieved via S3**:
- Policy profile
- Campaign data

**Output**: Outreach Plan, Message Content, Channel Selection, Timing, Offers

### Policy Optimizer Agent

Specializes in coverage and pricing adjustment recommendations.

**Responsibilities**:
- Coverage gap identification and recommendation
- Premium adjustment for competitive positioning
- Bundle optimization across product lines
- Discount eligibility verification
- Renewal term optimization

**Data Retrieved via S3**:
- Policy profile
- Product data

**Output**: Coverage Adjustments, Premium Recommendations, Bundle Options, Discounts

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/customer_engagement\` |
| **Churn Threshold** | \`0.7\` |
| **Retention Target** | \`0.95\` |
`,
              },
              {
                id: 'customer-engagement-architecture',
                title: 'Technical Architecture',
                content: `# Customer Engagement -- Technical Architecture

## Assessment Flow

\`\`\`diagram:customer-engagement-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:customer-engagement-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/customer_engagement/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── churn_predictor.py
    │       ├── outreach_agent.py
    │       ├── policy_optimizer.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── churn_predictor.py
            ├── outreach_agent.py
            ├── policy_optimizer.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "policy_id": "POLICY001",
  "engagement_type": "full",
  "additional_context": "Renewal approaching in 30 days"
}
\`\`\`

**engagement_type options**: \`full\`, \`churn_prediction\`, \`outreach_planning\`, \`policy_optimization\`

### Response Schema

\`\`\`json
{
  "policy_id": "POLICY001",
  "engagement_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "churn_risk": {
    "probability": 0.45,
    "risk_level": "moderate",
    "factors": ["Premium increase", "No claims benefit unused"]
  },
  "outreach": {
    "channel": "phone",
    "message_theme": "loyalty_reward",
    "offer": "5% multi-policy discount"
  },
  "optimization": {
    "coverage_adjustment": "Add roadside assistance",
    "premium_change": -50
  },
  "summary": "Moderate churn risk. Recommend loyalty call with multi-policy discount.",
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/customer_engagement/{policy_id}/profile.json\` | All agents |
| \`behavioral\` | \`samples/customer_engagement/{policy_id}/behavioral.json\` | Churn Predictor |
| \`campaigns\` | \`samples/customer_engagement/{policy_id}/campaigns.json\` | Outreach Agent |
| \`products\` | \`samples/customer_engagement/{policy_id}/products.json\` | Policy Optimizer |
`,
              },
              {
                id: 'customer-engagement-deployment',
                title: 'Deployment & Testing',
                content: `# Customer Engagement -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:customer-engagement-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Insurance** -> **Customer Engagement**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`customer-engagement-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=customer_engagement \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=customer_engagement \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Customer Engagement agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for customer-engagement |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Policy ID | Description | Expected Output |
|---|---|---|
| POLICY001 | Auto policy, renewal approaching, moderate churn risk | Retention outreach with loyalty discount |
| POLICY002 | Home policy, recent claim, satisfaction concern | Service recovery outreach with coverage review |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "policy_id": "POLICY001",
  "engagement_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/customer_engagement/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/customer_engagement/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
        ],
      },
      {
        id: 'operations',
        title: 'Operations',
        children: [
          {
            id: 'call-center-analytics',
            title: 'Call Center Analytics',
            children: [
              {
                id: 'call-center-analytics-business',
                title: 'Business & Agent Design',
                content: `# Call Center Analytics -- Business & Agent Design

## Business Overview

The Call Center Analytics application provides call monitoring, agent performance analysis, and operational insights for call center management. It coordinates specialist agents to monitor call quality, evaluate agent performance, and generate operational improvement recommendations.

## Analytics Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Analytics** | Complete monitoring + performance + insights | All agents in parallel |
| **Call Monitoring** | Real-time quality assessment | Call Monitor |
| **Performance Analysis** | Agent performance evaluation | Agent Performance Analyst |
| **Operational Insights** | Process improvement recommendations | Operations Insight Generator |

## Agent Design

### Orchestrator -- Call Center Analytics Supervisor

Coordinates specialist agents to deliver comprehensive call center analytics. Synthesizes quality, performance, and operational data into actionable management insights.

Considers:
- Call quality scores and compliance adherence
- Agent performance trends and coaching needs
- Operational efficiency and process bottlenecks
- Customer satisfaction correlation with metrics

### Call Monitor Agent

Specializes in real-time call quality assessment.

**Responsibilities**:
- Script adherence and compliance monitoring
- Customer sentiment detection during calls
- Issue escalation trigger identification
- Hold time and transfer pattern analysis
- Quality score calculation per interaction

**Data Retrieved via S3**:
- Call data
- Quality standards

**Output**: Quality Scores, Compliance Status, Sentiment Trends, Escalation Triggers

### Agent Performance Analyst Agent

Specializes in agent performance evaluation and coaching.

**Responsibilities**:
- Average handle time and resolution rate tracking
- First-call resolution analysis
- Customer satisfaction score correlation
- Skill gap identification
- Peer comparison and benchmarking

**Data Retrieved via S3**:
- Call data
- Performance benchmarks

**Output**: Performance Scores, Skill Gaps, Coaching Recommendations, Rankings

### Operations Insight Generator Agent

Specializes in operational improvement identification.

**Responsibilities**:
- Process bottleneck identification
- Staffing optimization recommendations
- Training program effectiveness analysis
- Technology improvement suggestions
- Cost-per-contact trend analysis

**Data Retrieved via S3**:
- Call data
- Operational data

**Output**: Improvement Recommendations, Staffing Plans, Training Priorities, Cost Analysis

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/call_center_analytics\` |
| **Quality Score Threshold** | \`0.8\` |
`,
              },
              {
                id: 'call-center-analytics-architecture',
                title: 'Technical Architecture',
                content: `# Call Center Analytics -- Technical Architecture

## Assessment Flow

\`\`\`diagram:call-center-analytics-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:call-center-analytics-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/call_center_analytics/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── call_monitor.py
    │       ├── agent_performance_analyst.py
    │       ├── operations_insight_generator.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── call_monitor.py
            ├── agent_performance_analyst.py
            ├── operations_insight_generator.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "center_id": "CC001",
  "analytics_type": "full",
  "additional_context": "Weekly performance review"
}
\`\`\`

**analytics_type options**: \`full\`, \`call_monitoring\`, \`performance_analysis\`, \`operational_insights\`

### Response Schema

\`\`\`json
{
  "center_id": "CC001",
  "analytics_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "quality": {
    "average_score": 0.87,
    "compliance_rate": 0.95,
    "escalation_rate": 0.08
  },
  "performance": {
    "avg_handle_time": 340,
    "first_call_resolution": 0.78,
    "csat": 4.2
  },
  "insights": ["Peak volume at 10-11am needs +2 agents", "Product knowledge training needed"],
  "summary": "Quality above target. FCR improving. Staffing gap identified at peak hours.",
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/call_center_analytics/{center_id}/profile.json\` | All agents |
| \`calls\` | \`samples/call_center_analytics/{center_id}/calls.json\` | Call Monitor |
| \`performance\` | \`samples/call_center_analytics/{center_id}/performance.json\` | Agent Performance Analyst |
| \`operations\` | \`samples/call_center_analytics/{center_id}/operations.json\` | Operations Insight Generator |
`,
              },
              {
                id: 'call-center-analytics-deployment',
                title: 'Deployment & Testing',
                content: `# Call Center Analytics -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:call-center-analytics-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Operations** -> **Call Center Analytics**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`call-center-analytics-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=call_center_analytics \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=call_center_analytics \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Call Center Analytics agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for call-center-analytics |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Center ID | Description | Expected Output |
|---|---|---|
| CC001 | Regional call center, 50 agents, banking support | Quality 87%, FCR 78%, staffing recommendations |
| CC002 | National call center, insurance claims | Quality 82%, escalation analysis, training needs |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "center_id": "CC001",
  "analytics_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/call_center_analytics/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/call_center_analytics/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'post-call-analytics',
            title: 'Post Call Analytics',
            children: [
              {
                id: 'post-call-analytics-business',
                title: 'Business & Agent Design',
                content: `# Post Call Analytics -- Business & Agent Design

## Business Overview

The Post Call Analytics application automates transcription processing, sentiment analysis, and action extraction for post-call analysis. It coordinates specialist agents to process call transcripts, assess customer sentiment, and extract follow-up actions.

## Processing Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Analysis** | Complete transcription + sentiment + action extraction | All agents in sequence |
| **Transcription Processing** | Audio-to-text and speaker identification | Transcription Processor |
| **Sentiment Analysis** | Customer and agent sentiment assessment | Sentiment Analyst |
| **Action Extraction** | Follow-up item identification | Action Extractor |

## Agent Design

### Orchestrator -- Post Call Analytics Supervisor

Coordinates specialist agents to analyze completed calls. Ensures accurate transcription, sentiment assessment, and action item capture for follow-up management.

Considers:
- Transcription accuracy and speaker attribution
- Sentiment trend throughout the call
- Action item completeness and assignment
- Compliance and quality review triggers

### Transcription Processor Agent

Specializes in call transcription and speaker diarization.

**Responsibilities**:
- Speech-to-text processing
- Speaker identification and diarization
- Timestamp alignment and segmentation
- Noise reduction and clarity enhancement
- Key term and phrase highlighting

**Data Retrieved via S3**:
- Call recording data
- Transcription models

**Output**: Structured Transcript, Speaker Segments, Timestamps, Key Terms

### Sentiment Analyst Agent

Specializes in conversational sentiment assessment.

**Responsibilities**:
- Turn-by-turn sentiment scoring
- Emotion detection (frustration, satisfaction, confusion)
- Sentiment trajectory analysis across call
- Agent empathy and professionalism assessment
- Overall interaction quality scoring

**Data Retrieved via S3**:
- Call recording data
- Sentiment models

**Output**: Sentiment Timeline, Emotion Markers, Quality Score, Agent Assessment

### Action Extractor Agent

Specializes in identifying and tracking follow-up items.

**Responsibilities**:
- Commitment and promise identification
- Callback and follow-up scheduling
- Issue resolution status tracking
- Escalation requirement detection
- Task assignment and deadline extraction

**Data Retrieved via S3**:
- Call recording data
- Action templates

**Output**: Action Items, Deadlines, Assignments, Escalation Flags, Resolution Status

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/post_call_analytics\` |
| **Transcription Confidence** | \`0.85\` |
`,
              },
              {
                id: 'post-call-analytics-architecture',
                title: 'Technical Architecture',
                content: `# Post Call Analytics -- Technical Architecture

## Assessment Flow

\`\`\`diagram:post-call-analytics-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:post-call-analytics-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/post_call_analytics/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── transcription_processor.py
    │       ├── sentiment_analyst.py
    │       ├── action_extractor.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── transcription_processor.py
            ├── sentiment_analyst.py
            ├── action_extractor.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "call_id": "CALL001",
  "processing_type": "full",
  "additional_context": "Customer complaint call"
}
\`\`\`

**processing_type options**: \`full\`, \`transcription_processing\`, \`sentiment_analysis\`, \`action_extraction\`

### Response Schema

\`\`\`json
{
  "call_id": "CALL001",
  "analysis_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "transcription": {
    "word_count": 2500,
    "speakers": 2,
    "duration_minutes": 12
  },
  "sentiment": {
    "customer_overall": -0.3,
    "agent_overall": 0.7,
    "trajectory": "negative_to_neutral"
  },
  "actions": [
    {"type": "callback", "deadline": "2025-03-16", "assigned_to": "supervisor"}
  ],
  "summary": "Complaint call resolved with callback scheduled. Sentiment improved by end.",
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/post_call_analytics/{call_id}/profile.json\` | All agents |
| \`recording\` | \`samples/post_call_analytics/{call_id}/recording.json\` | Transcription Processor |
| \`sentiment_models\` | \`samples/post_call_analytics/{call_id}/sentiment_models.json\` | Sentiment Analyst |
| \`action_templates\` | \`samples/post_call_analytics/{call_id}/action_templates.json\` | Action Extractor |
`,
              },
              {
                id: 'post-call-analytics-deployment',
                title: 'Deployment & Testing',
                content: `# Post Call Analytics -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:post-call-analytics-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Operations** -> **Post Call Analytics**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`post-call-analytics-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=post_call_analytics \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=post_call_analytics \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Post Call Analytics agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for post-call-analytics |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Call ID | Description | Expected Output |
|---|---|---|
| CALL001 | Customer complaint call, 12 minutes, resolved | Negative-to-neutral sentiment, callback scheduled |
| CALL002 | Product inquiry call, 5 minutes, satisfied | Positive sentiment, no follow-up required |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "call_id": "CALL001",
  "processing_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/post_call_analytics/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/post_call_analytics/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'call-summarization',
            title: 'Call Summarization',
            children: [
              {
                id: 'call-summarization-business',
                title: 'Business & Agent Design',
                content: `# Call Summarization -- Business & Agent Design

## Business Overview

The Call Summarization application automates key point extraction and summary generation for call center interactions. It coordinates specialist agents to identify key discussion points and produce concise, structured call summaries for CRM integration.

## Processing Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Summarization** | Complete extraction + summary generation | Both agents in sequence |
| **Key Point Extraction** | Main topic and action item identification | Key Point Extractor |
| **Summary Generation** | Structured summary creation | Summary Generator |

## Agent Design

### Orchestrator -- Call Summarization Supervisor

Coordinates specialist agents to produce accurate, concise call summaries. Ensures key points are captured and summaries are CRM-ready.

Considers:
- Key point completeness and accuracy
- Summary conciseness and clarity
- Action item capture for follow-up
- CRM field mapping and integration readiness

### Key Point Extractor Agent

Specializes in identifying main discussion topics and action items.

**Responsibilities**:
- Main topic identification and categorization
- Action item and commitment extraction
- Decision point documentation
- Customer request and concern cataloging
- Resolution and outcome recording

**Data Retrieved via S3**:
- Call data
- Extraction rules

**Output**: Key Points, Action Items, Decisions, Customer Concerns, Outcomes

### Summary Generator Agent

Specializes in structured summary creation for CRM integration.

**Responsibilities**:
- Executive summary generation
- Structured field population (reason, resolution, next steps)
- CRM-compatible format output
- Priority and follow-up flag assignment
- Multi-call thread summarization

**Data Retrieved via S3**:
- Call data
- Summary templates

**Output**: Call Summary, CRM Fields, Priority Level, Follow-Up Flags, Thread Context

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/call_summarization\` |
| **Key Point Confidence** | \`0.75\` |
`,
              },
              {
                id: 'call-summarization-architecture',
                title: 'Technical Architecture',
                content: `# Call Summarization -- Technical Architecture

## Assessment Flow

\`\`\`diagram:call-summarization-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:call-summarization-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/call_summarization/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── key_point_extractor.py
    │       ├── summary_generator.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── key_point_extractor.py
            ├── summary_generator.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "call_id": "CALL001",
  "processing_type": "full",
  "additional_context": "Service inquiry call"
}
\`\`\`

**processing_type options**: \`full\`, \`key_point_extraction\`, \`summary_generation\`

### Response Schema

\`\`\`json
{
  "call_id": "CALL001",
  "summary_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "key_points": [
    "Customer asked about account upgrade options",
    "Agent recommended premium tier",
    "Customer requested callback with pricing"
  ],
  "summary": {
    "reason": "Account upgrade inquiry",
    "resolution": "Information provided, callback scheduled",
    "next_steps": "Pricing callback within 24 hours",
    "priority": "medium"
  },
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/call_summarization/{call_id}/profile.json\` | Both agents |
| \`call_data\` | \`samples/call_summarization/{call_id}/call_data.json\` | Key Point Extractor |
| \`templates\` | \`samples/call_summarization/{call_id}/templates.json\` | Summary Generator |
`,
              },
              {
                id: 'call-summarization-deployment',
                title: 'Deployment & Testing',
                content: `# Call Summarization -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:call-summarization-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Operations** -> **Call Summarization**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`call-summarization-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=call_summarization \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=call_summarization \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Call Summarization agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for call-summarization |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Call ID | Description | Expected Output |
|---|---|---|
| CALL001 | Account upgrade inquiry, 8 minutes | 3 key points, structured summary with callback |
| CALL002 | Billing dispute, 15 minutes, escalated | 5 key points, escalation summary with timeline |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "call_id": "CALL001",
  "processing_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/call_summarization/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/call_summarization/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
        ],
      },
      {
        id: 'modernization',
        title: 'Modernization',
        children: [
          {
            id: 'legacy-migration',
            title: 'Legacy Migration',
            children: [
              {
                id: 'legacy-migration-business',
                title: 'Business & Agent Design',
                content: `# Legacy Migration -- Business & Agent Design

## Business Overview

The Legacy Migration application automates code analysis, migration planning, and automated conversion for legacy system migration. It coordinates specialist agents to analyze legacy codebases, plan migration strategies, and generate modernized code.

## Migration Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Migration** | Complete analysis + planning + conversion | All agents in sequence |
| **Code Analysis** | Legacy code assessment and mapping | Code Analyzer |
| **Migration Planning** | Strategy and phasing recommendation | Migration Planner |
| **Automated Conversion** | Code transformation and generation | Conversion Agent |

## Agent Design

### Orchestrator -- Legacy Migration Supervisor

Coordinates specialist agents in a migration pipeline. Ensures thorough analysis, viable planning, and accurate code conversion.

Considers:
- Code complexity and dependency mapping accuracy
- Migration strategy risk assessment
- Conversion accuracy and test coverage
- Business continuity during migration

### Code Analyzer Agent

Specializes in legacy code assessment and dependency mapping.

**Responsibilities**:
- Language and framework identification
- Code complexity metrics (cyclomatic, cognitive)
- Dependency graph construction
- Dead code and technical debt identification
- Business logic extraction and documentation

**Data Retrieved via S3**:
- Legacy code data
- Analysis rules

**Output**: Complexity Report, Dependency Graph, Dead Code List, Business Logic Map

### Migration Planner Agent

Specializes in migration strategy and execution planning.

**Responsibilities**:
- Migration approach selection (rehost, replatform, refactor)
- Phase planning and workstream definition
- Risk assessment and mitigation strategies
- Resource estimation and timeline
- Testing and rollback strategy

**Data Retrieved via S3**:
- Legacy code data
- Migration frameworks

**Output**: Migration Plan, Phase Schedule, Risk Matrix, Resource Estimate

### Conversion Agent

Specializes in automated code transformation and generation.

**Responsibilities**:
- Source-to-target language conversion
- API and interface modernization
- Database schema migration generation
- Unit test generation for converted code
- Configuration and deployment script creation

**Data Retrieved via S3**:
- Legacy code data
- Conversion templates

**Output**: Converted Code, Migration Scripts, Test Suite, Deployment Config

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/legacy_migration\` |
| **Max Analysis Time** | \`120 seconds\` |
| **Complexity Threshold** | \`0.7\` |
| **Conversion Confidence** | \`0.85\` |
`,
              },
              {
                id: 'legacy-migration-architecture',
                title: 'Technical Architecture',
                content: `# Legacy Migration -- Technical Architecture

## Assessment Flow

\`\`\`diagram:legacy-migration-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:legacy-migration-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/legacy_migration/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── code_analyzer.py
    │       ├── migration_planner.py
    │       ├── conversion_agent.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── code_analyzer.py
            ├── migration_planner.py
            ├── conversion_agent.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "project_id": "PROJ001",
  "migration_type": "full",
  "additional_context": "COBOL to Java migration"
}
\`\`\`

**migration_type options**: \`full\`, \`code_analysis\`, \`migration_planning\`, \`automated_conversion\`

### Response Schema

\`\`\`json
{
  "project_id": "PROJ001",
  "migration_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "analysis": {
    "language": "COBOL",
    "lines_of_code": 150000,
    "complexity": "high",
    "modules": 45
  },
  "plan": {
    "approach": "refactor",
    "phases": 4,
    "estimated_months": 18,
    "risk_level": "medium"
  },
  "conversion": {
    "files_converted": 45,
    "test_coverage": 0.82,
    "target_language": "Java"
  },
  "summary": "COBOL to Java migration planned in 4 phases over 18 months.",
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/legacy_migration/{project_id}/profile.json\` | All agents |
| \`source_code\` | \`samples/legacy_migration/{project_id}/source_code.json\` | Code Analyzer |
| \`frameworks\` | \`samples/legacy_migration/{project_id}/frameworks.json\` | Migration Planner |
| \`templates\` | \`samples/legacy_migration/{project_id}/templates.json\` | Conversion Agent |
`,
              },
              {
                id: 'legacy-migration-deployment',
                title: 'Deployment & Testing',
                content: `# Legacy Migration -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:legacy-migration-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Modernization** -> **Legacy Migration**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`legacy-migration-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=legacy_migration \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=legacy_migration \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Legacy Migration agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for legacy-migration |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Project ID | Description | Expected Output |
|---|---|---|
| PROJ001 | COBOL mainframe system, 150K LOC, batch processing | 4-phase refactor plan, Java target, 82% test coverage |
| PROJ002 | VB6 desktop application, 30K LOC | 2-phase replatform plan, .NET target |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "project_id": "PROJ001",
  "migration_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/legacy_migration/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/legacy_migration/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'code-generation',
            title: 'Code Generation',
            children: [
              {
                id: 'code-generation-business',
                title: 'Business & Agent Design',
                content: `# Code Generation -- Business & Agent Design

## Business Overview

The Code Generation application automates requirement analysis, code scaffolding, and test generation for application development. It coordinates specialist agents to translate requirements into implementation plans, generate code scaffolding, and create comprehensive test suites.

## Generation Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Generation** | Complete requirements + scaffolding + tests | All agents in sequence |
| **Requirement Analysis** | Technical specification generation | Requirement Analyst |
| **Code Scaffolding** | Project structure and boilerplate generation | Code Scaffolder |
| **Test Generation** | Unit and integration test creation | Test Generator |

## Agent Design

### Orchestrator -- Code Generation Supervisor

Coordinates specialist agents to produce working code from requirements. Ensures code quality, test coverage, and architectural consistency.

Considers:
- Requirement completeness and clarity
- Code quality and adherence to standards
- Test coverage and edge case handling
- Security and performance considerations

### Requirement Analyst Agent

Specializes in translating business requirements into technical specifications.

**Responsibilities**:
- Requirement parsing and decomposition
- Technical constraint identification
- API contract definition
- Data model design
- Acceptance criteria formulation

**Data Retrieved via S3**:
- Requirements data
- Technical standards

**Output**: Technical Spec, API Contracts, Data Models, Acceptance Criteria

### Code Scaffolder Agent

Specializes in project structure and implementation generation.

**Responsibilities**:
- Project structure creation
- Boilerplate and framework setup
- Implementation generation from specifications
- Configuration and environment setup
- Documentation generation

**Data Retrieved via S3**:
- Requirements data
- Code templates

**Output**: Project Structure, Implementation Code, Configuration, Documentation

### Test Generator Agent

Specializes in comprehensive test suite creation.

**Responsibilities**:
- Unit test generation from specifications
- Integration test creation
- Edge case identification and testing
- Performance test scaffolding
- Test data generation

**Data Retrieved via S3**:
- Requirements data
- Test frameworks

**Output**: Test Suite, Test Data, Coverage Report, Edge Cases

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/code_generation\` |
| **Max Generation Time** | \`90 seconds\` |
`,
              },
              {
                id: 'code-generation-architecture',
                title: 'Technical Architecture',
                content: `# Code Generation -- Technical Architecture

## Assessment Flow

\`\`\`diagram:code-generation-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:code-generation-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/code_generation/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── requirement_analyst.py
    │       ├── code_scaffolder.py
    │       ├── test_generator.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── requirement_analyst.py
            ├── code_scaffolder.py
            ├── test_generator.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "project_id": "GEN001",
  "generation_type": "full",
  "additional_context": "REST API for customer management"
}
\`\`\`

**generation_type options**: \`full\`, \`requirement_analysis\`, \`code_scaffolding\`, \`test_generation\`

### Response Schema

\`\`\`json
{
  "project_id": "GEN001",
  "generation_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "requirements": {
    "endpoints": 8,
    "data_models": 5,
    "constraints": ["REST", "Python", "PostgreSQL"]
  },
  "scaffolding": {
    "files_generated": 22,
    "framework": "FastAPI",
    "language": "Python"
  },
  "tests": {
    "test_count": 45,
    "coverage_estimate": 0.88,
    "edge_cases": 12
  },
  "summary": "Generated FastAPI project with 8 endpoints and 88% test coverage.",
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/code_generation/{project_id}/profile.json\` | All agents |
| \`requirements\` | \`samples/code_generation/{project_id}/requirements.json\` | Requirement Analyst |
| \`templates\` | \`samples/code_generation/{project_id}/templates.json\` | Code Scaffolder |
| \`test_frameworks\` | \`samples/code_generation/{project_id}/test_frameworks.json\` | Test Generator |
`,
              },
              {
                id: 'code-generation-deployment',
                title: 'Deployment & Testing',
                content: `# Code Generation -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:code-generation-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Modernization** -> **Code Generation**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`code-generation-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=code_generation \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=code_generation \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Code Generation agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for code-generation |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| Project ID | Description | Expected Output |
|---|---|---|
| GEN001 | REST API for customer management, Python/FastAPI | 22 files, 8 endpoints, 88% test coverage |
| GEN002 | Event-driven microservice, Node.js | 15 files, event handlers, integration tests |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "project_id": "GEN001",
  "generation_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/code_generation/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/code_generation/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
          {
            id: 'mainframe-migration',
            title: 'Mainframe Migration',
            children: [
              {
                id: 'mainframe-migration-business',
                title: 'Business & Agent Design',
                content: `# Mainframe Migration -- Business & Agent Design

## Business Overview

The Mainframe Migration application automates mainframe analysis, business rule extraction, and cloud code generation for mainframe-to-cloud migration. It coordinates specialist agents to analyze mainframe programs, extract business logic, and generate equivalent cloud-native implementations.

## Migration Types

| Type | Description | Agents Used |
|------|-------------|-------------|
| **Full Migration** | Complete analysis + extraction + generation | All agents in sequence |
| **Mainframe Analysis** | Program assessment and mapping | Mainframe Analyzer |
| **Rule Extraction** | Business logic identification and documentation | Business Rule Extractor |
| **Cloud Generation** | Cloud-native code generation | Cloud Code Generator |

## Agent Design

### Orchestrator -- Mainframe Migration Supervisor

Coordinates specialist agents to transform mainframe systems into cloud-native applications. Ensures business logic preservation and cloud architecture best practices.

Considers:
- Business rule completeness and accuracy
- Cloud architecture alignment with best practices
- Data migration integrity
- Performance equivalence in target environment

### Mainframe Analyzer Agent

Specializes in mainframe program analysis and assessment.

**Responsibilities**:
- COBOL/JCL/CICS program parsing and analysis
- Copybook and data structure mapping
- Job scheduling dependency analysis
- Screen map and UI flow documentation
- Database access pattern identification (DB2, VSAM, IMS)

**Data Retrieved via S3**:
- Mainframe source
- Analysis rules

**Output**: Program Inventory, Data Structures, Job Dependencies, Access Patterns

### Business Rule Extractor Agent

Specializes in business logic identification and documentation.

**Responsibilities**:
- Conditional logic extraction from COBOL paragraphs
- Calculation and formula documentation
- Validation rule identification
- Workflow and process flow mapping
- Business rule catalog generation

**Data Retrieved via S3**:
- Mainframe source
- Rule templates

**Output**: Business Rule Catalog, Process Flows, Validation Rules, Calculations

### Cloud Code Generator Agent

Specializes in cloud-native implementation generation.

**Responsibilities**:
- COBOL-to-Java/Python conversion
- Microservice decomposition from monolith
- Cloud database schema generation (RDS, DynamoDB)
- API layer generation (REST, GraphQL)
- Infrastructure-as-code generation (CloudFormation, Terraform)

**Data Retrieved via S3**:
- Mainframe source
- Cloud templates

**Output**: Cloud Code, Microservices, Database Schema, APIs, IaC Templates

## Configuration

| Setting | Value |
|---------|-------|
| **data_prefix** | \`samples/mainframe_migration\` |
| **Max Analysis Time** | \`120 seconds\` |
| **Conversion Confidence** | \`0.85\` |
`,
              },
              {
                id: 'mainframe-migration-architecture',
                title: 'Technical Architecture',
                content: `# Mainframe Migration -- Technical Architecture

## Assessment Flow

\`\`\`diagram:mainframe-migration-assessment-flow
\`\`\`

## State Machine

\`\`\`diagram:mainframe-migration-state-machine
\`\`\`

## Directory Structure

\`\`\`
use_cases/mainframe_migration/
├── README.md
└── src/
    ├── strands/
    │   ├── config.py
    │   ├── models.py
    │   ├── orchestrator.py
    │   └── agents/
    │       ├── mainframe_analyzer.py
    │       ├── business_rule_extractor.py
    │       ├── cloud_code_generator.py
    └── langchain_langgraph/
        ├── config.py
        ├── models.py
        ├── orchestrator.py
        └── agents/
            ├── mainframe_analyzer.py
            ├── business_rule_extractor.py
            ├── cloud_code_generator.py
\`\`\`

## Data Models

### Request Schema

\`\`\`json
{
  "system_id": "MF001",
  "migration_type": "full",
  "additional_context": "Core banking COBOL system"
}
\`\`\`

**migration_type options**: \`full\`, \`mainframe_analysis\`, \`rule_extraction\`, \`cloud_generation\`

### Response Schema

\`\`\`json
{
  "system_id": "MF001",
  "migration_id": "a1b2c3d4-...",
  "timestamp": "2025-03-15T10:30:00Z",
  "analysis": {
    "programs": 200,
    "copybooks": 85,
    "jcl_jobs": 45,
    "total_loc": 500000
  },
  "rules": {
    "business_rules_extracted": 350,
    "validation_rules": 120,
    "calculations": 85
  },
  "cloud_code": {
    "microservices": 12,
    "apis": 25,
    "target_platform": "AWS"
  },
  "summary": "500K LOC analyzed. 350 business rules extracted. 12 microservices generated.",
  "raw_analysis": { "..." : "..." }
}
\`\`\`

## Framework Comparison

| Aspect | Strands | LangGraph |
|--------|---------|-----------|
| Base Class | StrandsOrchestrator | LangGraphOrchestrator |
| State Management | Method parameters | TypedDict with message reducer |
| Parallelism | \`run_parallel()\` built-in | \`asyncio.gather()\` explicit |
| Graph Definition | Sequential method calls | StateGraph with nodes and edges |
| Routing | Direct conditional logic | \`set_conditional_entry_point\` |
| Synthesis | Custom synthesis prompt | \`with_structured_output()\` schema |
| Agent Max Tokens | 8,192 | 4,096 |
| Tool Integration | \`s3_retriever_strands\` | \`s3_retriever\` (LangChain) |

## Model Configuration

| Setting | Value |
|---------|-------|
| **Model** | Claude Sonnet 4 (\`anthropic.claude-haiku-4-5-20251001-v1:0\`) |
| **Regional Routing** | \`get_regional_model_id()\` for us-east-1, us-west-2, eu-west-1 |
| **Temperature** | 0.1 (deterministic for consistent output) |

## Tool Integration

Both frameworks use the **s3_retriever_tool** to fetch data from S3:

| Data Type | S3 Key Pattern | Used By |
|-----------|---------------|--------|
| \`profile\` | \`samples/mainframe_migration/{system_id}/profile.json\` | All agents |
| \`source\` | \`samples/mainframe_migration/{system_id}/source.json\` | Mainframe Analyzer |
| \`rules\` | \`samples/mainframe_migration/{system_id}/rules.json\` | Business Rule Extractor |
| \`cloud_templates\` | \`samples/mainframe_migration/{system_id}/cloud_templates.json\` | Cloud Code Generator |
`,
              },
              {
                id: 'mainframe-migration-deployment',
                title: 'Deployment & Testing',
                content: `# Mainframe Migration -- Deployment & Testing

## Deployment Pipeline

\`\`\`diagram:mainframe-migration-deployment-pipeline
\`\`\`

## Deploy via Control Plane UI

1. Navigate to **FSI Foundry** -> **Modernization** -> **Mainframe Migration**
2. Choose framework: **Strands** or **LangGraph**
3. Configure deployment:
   - **Deployment Name**: \`mainframe-migration-prod\`
   - **AWS Region**: \`us-east-1\`
   - **Model**: Claude Sonnet 4
4. Click **Deploy**

## Deploy via CLI

\`\`\`bash
# Deploy to AgentCore (recommended)
USE_CASE_ID=mainframe_migration \\
FRAMEWORK=strands \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_agentcore.sh

# Alternative: Deploy to EC2
USE_CASE_ID=mainframe_migration \\
FRAMEWORK=langchain_langgraph \\
AWS_REGION=us-east-1 \\
./applications/fsi_foundry/scripts/deploy/full/deploy_ec2.sh
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|----------|--------|
| ECR Repository | Container image for Mainframe Migration agent runtime |
| IAM Role + 6 Policies | Permissions for Bedrock, S3, ECR, CloudWatch, X-Ray |
| S3 Data Bucket | Sample data for mainframe-migration |
| S3 Code Bucket | AgentCore deployment package |
| CloudFormation Stack | Bedrock AgentCore Runtime |
| CloudWatch Log Group | Agent execution logs |

Deployment completes in approximately 8-12 minutes.

## Sample Test Data

| System ID | Description | Expected Output |
|---|---|---|
| MF001 | Core banking COBOL system, 500K LOC, DB2 backend | 12 microservices, 350 rules extracted, AWS target |
| MF002 | Insurance claims COBOL system, 200K LOC | 8 microservices, 150 rules, serverless target |

## Testing the Deployed Runtime

### Full Assessment
\`\`\`bash
RUNTIME_ARN="<from deployment outputs>"

PAYLOAD=$(echo -n '{
  "system_id": "MF001",
  "migration_type": "full"
}' | base64)

aws bedrock-agentcore invoke-agent-runtime \\
  --agent-runtime-arn $RUNTIME_ARN \\
  --payload $PAYLOAD \\
  --region us-east-1 \\
  output.json

cat output.json | jq '.'
\`\`\`

### Using Test Scripts
\`\`\`bash
# Run automated tests
./applications/fsi_foundry/scripts/use_cases/mainframe_migration/test/test_agentcore.sh
./applications/fsi_foundry/scripts/use_cases/mainframe_migration/test/test_ec2.sh
\`\`\`

## Monitoring & Observability

- **CloudWatch Logs**: Full agent execution traces, tool calls, model invocations
- **CloudWatch Metrics**: Invocation count, latency (p50/p95/p99), error rate
- **Deployment Status**: Real-time status tracking in the control plane UI
- **Build Logs**: CodeBuild execution logs accessible from deployment detail page

## Cleanup

\`\`\`bash
# Destroy all provisioned resources
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
./applications/fsi_foundry/scripts/cleanup/cleanup_ec2.sh
\`\`\``,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'ref-impl',
    title: 'Reference Implementations',
    children: [
      {
        id: 'ref-impl-overview',
        title: 'Overview',
        content: `# Reference Implementations

Reference implementations are **deep, feature-rich full-stack solutions** for a specific niche FSI use case. Each includes a complete frontend, backend API, infrastructure-as-code, and deployment automation — designed to be deployed as a standalone application.

## How They Differ from FSI Foundry

| Dimension | Reference Implementations | FSI Foundry |
|---|---|---|
| **Scope** | Deep, end-to-end solution for one use case | Broad POC coverage across 34 use cases |
| **Stack** | Full-stack: frontend + backend + infra + CI/CD | Agent backend only (orchestrator + agents + tools) |
| **Deployment** | Standalone app with its own infrastructure | Deployed via shared FSI Foundry pipeline |
| **Complexity** | Full-stack architecture | POC-level implementations |

## Available Implementations

| Implementation | Domain | Stack | Status |
|---|---|---|---|
| Market Surveillance | Capital Markets | Next.js + AgentCore + Terraform + RDS | Available |
| Shopping Concierge Agent | Agentic Payments | React + Strands + CDK + Amplify | Available |
| Case Management | Fraud & Compliance | React + Bedrock + Lambda + DynamoDB + CloudFront | Available |
| Agent Safety Controls | Platform & Governance | ECS + CloudFront + Cognito + DynamoDB + Lambda | Available |
| Payments Fraud | Payments & Fraud | Next.js + Strands (supervisor + 3 specialists) + Terraform | Available |
| Merchant Onboarding | Payments & Risk | React + Multi-agent + OFAC + HITL approvals | Available |
| Investment Research and Risk Accelerator | Capital Markets | AI research and risk-analysis assistant on Bedrock AgentCore | Available |
| AgentCore-in-a-Box | Field Demo | Grab-and-go multi-agent FS platform with every AgentCore primitive | Available |`,
      },
      {
        id: 'market-surveillance-ref',
        title: 'Market Surveillance',
        children: [
          {
            id: 'market-surveillance-ref-overview',
            title: 'Overview',
            content: `# Market Surveillance — Reference Implementation

AI-powered market surveillance system for detecting and investigating suspicious trading patterns in Fixed Income markets using AWS Bedrock AgentCore.

## Key Capabilities

- **Multi-Agent Architecture** — Coordinator orchestrates specialized agents for data discovery, enrichment, and rule evaluation
- **Trade Pattern Detection** — 29 decision tree rules for identifying suspicious trading patterns
- **Configuration-Driven** — All workflows, rules, and schemas loaded from S3 for easy updates without code changes
- **Audit Trail** — Complete logging of agent decisions, state transitions, and tool calls
- **Enterprise Security** — Cognito authentication, VPC isolation, encrypted data at rest and in transit, read-only database access
- **Conversation Memory** — DynamoDB-backed persistent conversation history across sessions

## Architecture

| Component | Technology | Details |
|---|---|---|
| Frontend | Next.js on EC2 with ALB | Served via CloudFront CDN with WAF protection |
| Agent System | AWS Bedrock AgentCore Runtime | Strands SDK with MCP Gateway for tool access |
| Data Layer | PostgreSQL (RDS Aurora) | Read-only access for trade and account data |
| Config Storage | S3 | Workflow definitions, decision tree rules, agent schemas |
| Conversation Store | DynamoDB | Persistent chat history and investigation state |
| Auth | AWS Cognito | User pools with JWT-based authentication |
| Networking | VPC | Private subnets, NAT gateway, security groups |
| CDN | CloudFront | Edge caching with custom domain support |
| Firewall | AWS WAF | Rate limiting and IP-based access control |

## Agent System

| Agent | Role | Tools |
|---|---|---|
| Coordinator | Main orchestrator — routes investigation workflow, manages state transitions | Workflow config loader, state manager |
| Data Discovery | Retrieves trade data, account info, and counterparty details from RDS | SQL query tool via MCP Gateway (read-only) |
| Data Enrichment | Augments raw trade data with market context, reference data, and historical patterns | S3 config reader, enrichment rules engine |
| Trade Analyst | Evaluates 29 decision tree rules against enriched data, produces disposition | Rule engine, decision tree evaluator, report generator |

## Investigation Workflow

1. User submits a trade alert for investigation
2. Coordinator loads workflow configuration from S3
3. Data Discovery agent queries RDS for trade details, account history, and counterparty info
4. Data Enrichment agent augments with market context and reference data
5. Trade Analyst evaluates 29 decision tree rules against enriched data
6. System produces an audit-ready disposition report with rule-by-rule findings
7. Full investigation trail stored in DynamoDB for compliance review

## Decision Tree Rules

The system evaluates 29 configurable rules across categories:
- **Price manipulation** — Unusual price movements relative to market
- **Volume anomalies** — Abnormal trading volumes or patterns
- **Timing patterns** — Suspicious timing relative to market events
- **Counterparty risk** — Unusual counterparty relationships or concentrations
- **Cross-market signals** — Correlated activity across instruments or venues

All rules are loaded from S3 JSON configuration — no code changes needed to add, modify, or disable rules.

## Project Structure

\`\`\`
market-surveillance/
├── infrastructure/
│   ├── modules/                 # 12+ shared Terraform modules
│   │   ├── agentcore-runtime/   # AgentCore deployment
│   │   ├── agentcore-memory/    # Persistent memory
│   │   ├── agentcore-gateway/   # MCP Gateway for tools
│   │   ├── ec2-webapp/          # Web app hosting
│   │   ├── alb/                 # Load balancer
│   │   ├── cloudfront/          # CDN distribution
│   │   ├── rds/                 # PostgreSQL database
│   │   ├── lambda/              # API functions
│   │   ├── cognito/             # Authentication
│   │   └── ...                  # kms, acm, firewall, etc.
│   ├── foundations/             # Root module 1 — VPC, RDS, Cognito, ALB
│   └── app-infra/              # Root module 2 — ECR, AgentCore, API GW, webapp
├── agent-backend/               # Python agent system
│   ├── agents/                  # Coordinator, discovery, enrichment, analyst
│   ├── configs/                 # Workflow and rule configurations
│   └── Dockerfile
├── trade-alerts-app/            # Next.js frontend
├── seeding_scripts/             # Database seeding pipeline
└── scripts/                     # Deployment utilities
\`\`\``,
          },
          {
            id: 'market-surveillance-ref-deploy',
            title: 'Deployment',
            content: `# Market Surveillance — Deployment

## Infrastructure

Two Terraform root modules with a one-way dependency:

| Stack | Contains | Order |
|---|---|---|
| **foundations** | VPC, KMS, RDS, Cognito, ALB, CloudFront, WAF, DynamoDB, Bastion | First |
| **app-infra** | ECR, Lambda, AgentCore, API Gateway, S3 configs, EC2 webapp | Second (reads foundations outputs via remote state) |

## Prerequisites

- AWS CLI configured with credentials
- Terraform >= 1.0
- Docker with buildx support (for multi-arch container builds)
- Node.js >= 18 (for frontend build)
- Make (recommended for simplified commands)

## Deploy with Make (Recommended)

\`\`\`bash
cd applications/reference_implementations/market-surveillance

# Deploy full stack (infrastructure + webapp + database seeding)
make deploy ENV=dev

# Deploy infrastructure only
make deploy-infra ENV=dev

# Deploy foundations only
make deploy-foundations ENV=dev

# Deploy app-infra only (requires foundations)
make deploy-app-infra ENV=dev
\`\`\`

## Deploy with Scripts

\`\`\`bash
# Deploy full stack with auto-approve
scripts/deploy-backend.sh --environment dev --auto-approve

# Deploy only foundations
scripts/deploy-backend.sh --environment dev --foundation-only

# Deploy only app-infra
scripts/deploy-backend.sh --environment dev --app-infra-only
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|---|---|
| VPC + Subnets | Network isolation with public/private subnets |
| RDS Aurora PostgreSQL | Trade and account data storage |
| Cognito User Pool | Authentication for frontend and API |
| ALB + Target Groups | Load balancing for webapp and API |
| CloudFront Distribution | CDN for frontend with WAF |
| ECR Repository | Container images for agent and webapp |
| AgentCore Runtime | Bedrock agent execution environment |
| AgentCore Memory | Persistent conversation storage |
| AgentCore MCP Gateway | Tool access gateway for database queries |
| Lambda Functions | API endpoints for conversation management |
| API Gateway | HTTP API for frontend-to-backend communication |
| S3 Buckets | Agent configs, workflow rules, Terraform state |
| DynamoDB Tables | Conversation history, Terraform locks |
| KMS Keys | Encryption for RDS, S3, and DynamoDB |
| WAF Web ACL | Rate limiting and IP filtering |

## Database Seeding

After infrastructure deployment, seed the database with sample trade data:

\`\`\`bash
# Generate and load sample data
make seed-db ENV=dev

# Or use the seeding scripts directly
cd seeding_scripts
python generate_data.py
python load_data.py
\`\`\`

## Cleanup

\`\`\`bash
# Destroy all resources
make destroy ENV=dev

# Or destroy in reverse order
scripts/deploy-backend.sh --environment dev --destroy
\`\`\``,
          },
        ],
      },
      {
        id: 'shopping-concierge-ref',
        title: 'Shopping Concierge Agent',
        children: [
          {
            id: 'shopping-concierge-ref-overview',
            title: 'Overview',
            content: `# Shopping Concierge Agent — Reference Implementation

AI-powered concierge with shopping assistance, product search, cart management, and mock payment support. Built with Strands SDK, MCP tools, and AWS Bedrock AgentCore.

## Features

- **Shopping Assistant** — Product search and personalized recommendations via SERP API integration
- **Cart & Payment** — Full cart management with mock payment processing flow
- **Conversation Memory** — Persistent chat history across sessions via DynamoDB
- **Real-time Streaming** — Live agent responses with tool usage indicators in the UI
- **Secure Authentication** — AWS Cognito with JWT-based auth and session management
- **MCP Tool Integration** — Agent tools exposed via Model Context Protocol servers
- **Product Comparison** — Side-by-side feature and price comparison across products
- **User Preferences** — Personalized recommendations based on user profile and constraints

## Architecture

| Component | Technology | Details |
|---|---|---|
| Frontend | React web application | Real-time streaming UI with tool usage indicators |
| Agent Runtime | AWS Bedrock AgentCore | Strands SDK with MCP tool integration |
| Tools | MCP Servers | Product search (SERP API), cart management, payment mock |
| Auth | AWS Cognito via Amplify | User pools, JWT tokens, session management |
| Memory | DynamoDB via Amplify | Conversation history, user preferences, cart state |
| Infrastructure | AWS CDK | Multi-stack deployment (Amplify + MCP + Agent + Frontend) |
| Observability | CloudWatch | Logs, metrics, and agent execution traces |

## Agent System

| Agent | Role | Tools |
|---|---|---|
| Shopping Assistant | Product search, recommendations, feature comparison, reviews research | SERP API search, product database, review aggregator |
| Payment Agent | Cart management, checkout flow, mock payment processing | Cart state manager, payment mock, order tracker |

## User Interaction Flow

1. User authenticates via Cognito
2. User describes what they are looking for (natural language)
3. Shopping Assistant searches products via SERP API, filters by user preferences
4. Agent presents options with prices, reviews, and feature comparisons
5. User adds items to cart, agent manages cart state
6. Payment Agent handles checkout with mock payment flow
7. Full conversation history persisted for future sessions

## Project Structure

\`\`\`
shopping-concierge-agent/
├── amplify/                    # AWS Amplify backend
│   ├── auth/                   # Cognito configuration
│   ├── data/                   # DynamoDB tables and GraphQL schema
│   └── storage/                # S3 storage configuration
├── concierge_agent/           # Agent code and Docker container
│   ├── Dockerfile
│   └── code/                  # Python agent implementation
│       ├── agent.py           # Main agent logic
│       ├── tools/             # MCP tool definitions
│       └── prompts/           # System prompts and templates
├── infrastructure/            # CDK infrastructure
│   ├── lib/                   # CDK stack definitions
│   └── bin/                   # CDK app entry point
├── documents/                 # Knowledge base documents
├── web-ui/                    # React frontend
│   ├── src/
│   │   ├── components/        # UI components
│   │   ├── hooks/             # Custom React hooks
│   │   └── services/          # API client and auth
│   └── public/
└── scripts/                   # Deployment and setup scripts
\`\`\``,
          },
          {
            id: 'shopping-concierge-ref-deploy',
            title: 'Deployment',
            content: `# Shopping Concierge Agent — Deployment

## Prerequisites

- AWS Account with Bedrock access (Claude models enabled)
- AWS CDK CLI installed and bootstrapped
- Docker (for container builds)
- Node.js >= 18
- Python >= 3.11
- SERP API key (optional — enables live product search; without it, agent uses mock data)

## Deployment Steps

The Shopping Concierge uses AWS CDK with multiple stacks:

\`\`\`bash
cd applications/reference_implementations/shopping-concierge-agent

# 1. Install dependencies
npm install
pip install -r concierge_agent/code/requirements.txt

# 2. Bootstrap CDK (if not already done)
cdk bootstrap

# 3. Deploy all stacks
cdk deploy --all

# Or deploy individual stacks:
cdk deploy AmplifyStack        # Cognito, DynamoDB, GraphQL
cdk deploy McpServerStack      # MCP tool servers
cdk deploy AgentStack          # AgentCore runtime
cdk deploy FrontendStack       # React web UI
\`\`\`

## Infrastructure Provisioned

| Resource | Purpose |
|---|---|
| Amplify Backend | Cognito user pools, DynamoDB tables, GraphQL API |
| AgentCore Runtime | Bedrock agent execution with Strands SDK |
| MCP Servers | Tool servers for product search, cart, and payment |
| ECR Repository | Container images for agent and MCP servers |
| S3 Bucket | Frontend hosting and knowledge base documents |
| CloudWatch | Logs, metrics, and agent execution traces |
| IAM Roles | Least-privilege access for each component |

## Configuration

### SERP API Key (Optional)

For live product search, set the SERP API key:

\`\`\`bash
# Via environment variable
export SERP_API_KEY=your_key_here

# Or via CDK context
cdk deploy --context serpApiKey=your_key_here
\`\`\`

Without a SERP API key, the agent falls back to mock product data for demonstration.

### Mock Payment Mode

The payment system uses a mock implementation by default. See the [Frontend Mock Mode documentation](docs/FRONTEND_MOCK_MODE.md) for details on the mock payment flow.

## Cleanup

\`\`\`bash
# Destroy all stacks
cdk destroy --all
\`\`\``,
          },
        ],
      },
      {
        id: 'case-management-ref',
        title: 'Case Management',
        children: [
          {
            id: 'case-management-ref-overview',
            title: 'Overview',
            content: `# Case Management — Reference Implementation

AI-powered fraud detection and case management platform built with AWS serverless architecture, React, and Claude AI on Bedrock.

## Key Capabilities

- **Real-time Fraud Detection** — Analyze transactions with ML-based scoring and pattern detection
- **AI-Powered Investigation** — Natural language chat interface powered by Claude Sonnet 4 on Bedrock
- **Pattern Recognition** — Automatically detects smurfing, high-velocity patterns, mule accounts, and large transaction anomalies
- **Decision Engine** — Three-tier fraud response: APPROVE, STEP_UP_REVIEW, HOLD_AND_CASE
- **Secure Architecture** — CloudFront CDN with Origin Access Control for enterprise security
- **DynamoDB Storage** — 5 tables for transaction data, features, patterns, and actor state

## Architecture

| Component | Technology | Details |
|---|---|---|
| Frontend | React UI | Hosted on S3, served via CloudFront with OAC |
| API | API Gateway + 4 Lambdas | Python backend with fraud scoring and Bedrock chat |
| Storage | 5 DynamoDB Tables | Transaction logs, features, pair statistics, destination tracking, actor state |
| AI | Amazon Bedrock | Claude Sonnet 4 for conversational investigation |
| CDN | CloudFront | Secure HTTPS delivery with Origin Access Control |
| Optional | AgentCore SAR Stack | Advanced SAR report generation |

## Agents

- **Fraud Scoring Agent** — Lambda function for ML-based transaction scoring and pattern detection
- **Transaction Reader Agent** — Lambda for DynamoDB queries and transaction history retrieval
- **Bedrock Chat Agent** — Conversational investigation interface with Claude Sonnet 4
- **Optional SAR Agent** — AgentCore integration for advanced Suspicious Activity Report generation

## Investigation Workflow

1. Real-time transaction analysis with ML scoring
2. Automated pattern detection for fraud risk indicators
3. Interactive natural language investigation with Claude AI
4. Three-tier decision framework for response actions
5. Complete audit trail for compliance review`,
          },
          {
            id: 'case-management-ref-deploy',
            title: 'Deployment',
            content: `# Case Management — Deployment

## Prerequisites

**AWS Account Requirements:**
- Bedrock access with Claude Sonnet 4 model enabled
- IAM permissions for Lambda, DynamoDB, API Gateway, S3, CloudFront
- Sufficient service quotas for 4 Lambda functions and 5 DynamoDB tables

**Local Tools:**
\`\`\`bash
# AWS CLI configured with credentials
aws --version

# Node.js 18+ for React build
node --version

# jq for JSON processing (cleanup script)
brew install jq  # macOS
\`\`\`

**AWS Credentials:**
Create \`.env\` file in project root:
\`\`\`bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-20250514-v1:0
\`\`\`

## Deployment

Deploy everything with a single command:

\`\`\`bash
cd applications/reference_implementations/case-management
bash deploy.sh
\`\`\`

This command provisions:
- 5 DynamoDB tables (txn_logs, txn_features, pair_stats, dst_src_window, actor_state)
- 4 Lambda functions with IAM roles (fraud scoring, transaction reader, SAR API, bedrock chat)
- API Gateway with CORS enabled
- React UI build and S3 upload
- CloudFront distribution with HTTPS and Origin Access Control
- Optional AgentCore stack (skipped if CLI not installed)

**Output:**
\`\`\`
Frontend:   https://xxxxx.cloudfront.net
API:        https://xxxxx.execute-api.us-east-1.amazonaws.com/prod
\`\`\`

CloudFront deployment takes 5–10 minutes to propagate globally.

## What Gets Provisioned

| Resource | Purpose |
|---|---|
| DynamoDB Tables | Transaction logs, feature store, pattern tracking, actor state |
| Lambda Functions | Fraud scoring engine, query interface, SAR reports, Bedrock chat |
| API Gateway | REST endpoints for frontend communication |
| S3 Bucket | Frontend assets and CloudFront origin |
| CloudFront Distribution | CDN with OAC for secure S3 access |
| IAM Roles & Policies | Least-privilege access for each component |
| KMS Keys | Optional encryption for sensitive data |

## Cleanup

**WARNING: This permanently deletes all resources and data.**

\`\`\`bash
bash cleanup.sh
\`\`\`

Removes:
- All DynamoDB tables (data is lost)
- All Lambda functions and IAM roles
- API Gateway
- S3 bucket and CloudFront distribution
- AgentCore resources (if deployed)

The script will prompt for confirmation before deletion.`,
          },
        ],
      },
      {
        id: 'agent-safety-ref',
        title: 'Agent Safety Controls',
        children: [
          {
            id: 'agent-safety-ref-overview',
            title: 'Overview',
            content: `# Agent Safety Controls — Reference Implementation

Modular toolkit for monitoring and managing AI agents running on Amazon Bedrock AgentCore. Provides human-in-the-loop safety controls with centralized dashboard, automated cost management, evaluation monitoring, observability, and session-level intervention.

## Key Capabilities

- **Web Dashboard** — ECS Express Mode + CloudFront + Cognito authentication with agent monitoring UI
- **Automated Budget Controls** — AWS Budgets created per agent with SNS email alerts at 80% and 100% thresholds
- **Automated Evaluation Setup** — 7 built-in evaluators with CloudWatch alarms for quality issues
- **Observability Alarms** — Anomaly detection for latency, errors, token usage, and invocation count
- **Kill Switch** — Revoke Bedrock access for single agent or all agents instantly via IAM deny policy
- **Session Management** — Stop individual sessions or all sessions from dashboard
- **Audit Trail** — Complete logging of interventions with identity and reason

## Architecture

| Component | Technology | Details |
|---|---|---|
| Dashboard | ECS Express Mode | FastAPI backend with HTML/CSS/JS single-file frontend |
| Authentication | AWS Cognito | User pools with JWT validation on every API request |
| Data Store | 6 DynamoDB Tables | Single source of truth for registry, sessions, interventions, signals |
| CDN | CloudFront | Distribution with origin verification header for security |
| Cost Controls | AWS Budgets + SNS | Event-driven budget automation per agent |
| Evaluation | CloudWatch Alarms | AgentCore Online Evaluation configs with alarm thresholds |
| Observability | CloudWatch | Anomaly detection alarms for performance metrics |
| Kill Switch | Lambda + IAM | On-demand policy attachment for access revocation |

## Agents & Automation

- **Auto Budget Lambda** — EventBridge-triggered, creates AWS Budgets on agent deployment
- **Auto Eval Lambda** — Sets up AgentCore evaluation configs with CloudWatch alarms
- **Auto Obs Lambda** — Creates anomaly detection alarms for latency, errors, tokens, invocations
- **Session Reporter Lambda** — Heartbeat-based session tracking to DynamoDB
- **Kill Switch Lambda** — IAM deny policy management for emergency shutdown (reversible)
- **Stop Sessions Lambda** — Tier 1 intervention for stopping active sessions

## Intervention Model

| Tier | Action | Scope | Reversible |
|---|---|---|---|
| Tier 1 | Stop Sessions | All active sessions for one agent | No (sessions terminated) |
| Tier 2 | Revoke IAM | Single agent or all agents Bedrock access | Yes (restore from dashboard) |`,
          },
          {
            id: 'agent-safety-ref-deploy',
            title: 'Deployment',
            content: `# Agent Safety Controls — Deployment

## Prerequisites

- AWS CLI v2 configured with admin-level IAM permissions (assumed role recommended)
- Python 3.11+ with boto3
- Docker (for dashboard container)
- Amazon Bedrock model access enabled (Claude Sonnet 4)
- AgentCore access enabled in your AWS account

## Quick Start — Deploy Everything

Deploy the full stack with one command:

\`\`\`bash
cd applications/reference_implementations/agent-safety

./deploy-all.sh \\
  --profile <your-aws-profile> \\
  --region us-east-1 \\
  --admin-email you@company.com \\
  --admin-password 'YourPassword123!'
\`\`\`

This takes 15–20 minutes and deploys all components in phases.

## What Gets Provisioned

| Phase | Resources | Time |
|---|---|---|
| 1. Dashboard | ECR, Docker image, 6 DynamoDB tables, Cognito, ECS Express Mode, CloudFront, Stop Sessions Lambda | ~10 min |
| 2. Cost Controls | SNS topic, email subscription, EventBridge rule, Auto Budget Lambda | ~3 min |
| 2b. Evaluation Controls | Auto Eval Lambda, CloudWatch alarms, EventBridge rule | ~2 min |
| 2c. Kill Switch | Kill Switch Lambda with IAM deny policy management | ~2 min |
| 2d. Observability Controls | Auto Obs Lambda, CloudWatch anomaly detection alarms | ~2 min |
| 3. Sample Agent | Inference Profile, S3 package, IAM role, AgentCore Runtime | ~5 min |

**Output:**
CloudFront dashboard URL for immediate sign-in with Cognito credentials.

## DynamoDB Tables (6 total)

| Table | Purpose |
|---|---|
| safety-dashboard-registry | Agent metadata, runtime info, settings |
| safety-dashboard-sessions | Live session tracking with heartbeats |
| safety-dashboard-interventions | Audit trail of all interventions |
| safety-dashboard-cost-signals | Per-agent budget data from AWS Budgets |
| safety-dashboard-obs-signals | Per-agent observability metrics |
| safety-dashboard-eval-signals | Per-agent evaluation scores |

## Deploy Components Individually

Each component is independent. Deploy in this order:

\`\`\`bash
# 1. Dashboard (includes DynamoDB tables)
cd dashboard && ./deploy.sh --profile <profile> --region us-east-1 \\
  --admin-email you@company.com --admin-password 'YourPassword123!'

# 2. Cost Controls
cd cost-controls && ./deploy.sh --profile <profile> --region us-east-1 \\
  --notification-email you@company.com

# 3. Sample Agent (stateless)
cd sample-agent && python deploy.py --name my_agent --region us-east-1 --profile <profile>

# 3b. Sample Agent (with memory)
cd sample-agent && python deploy.py --name my_agent --region us-east-1 --profile <profile> --create-memory

# Invoke the agent
python sample-agent/invoke_agent.py --arn <AGENT_ARN> --prompt "Hello!" --region us-east-1
\`\`\`

## Cleanup

**WARNING: This permanently deletes all resources and data.**

\`\`\`bash
./destroy-all.sh --profile <profile> --region us-east-1 --agent-name my_agent
\`\`\`

Removes:
- All DynamoDB tables (data is lost)
- ECR repositories and container images
- Cognito user pools
- ECS task definitions and CloudWatch log groups
- CloudFront distribution
- Lambda functions, EventBridge rules, SNS topics
- IAM roles and policies
- All CloudWatch alarms`,
          },
        ],
      },
      {
        id: 'payments-fraud-ref',
        title: 'Payments Fraud',
        content: `# Payments Fraud — Reference Implementation

Agent-native fraud scoring, natural-language investigation, and FinCEN-structured SAR drafting. A supervisor + 3 specialist agents on Bedrock AgentCore (Strands), with a Next.js UI and Cognito auth.

## Architecture

| Component | Details |
|-----------|---------|
| Frontend | Next.js + MUI with a BFF proxy for signed calls into AgentCore |
| Agent System | Bedrock AgentCore Runtime; Strands supervisor coordinates Scorer / Investigation / SAR agents |
| Auth | Cognito user pool + hosted UI |
| Data | Bundled synthetic sample data for hands-off demos |
| IaC | Terraform, composed from \`agent-runtime-agentcore\` + \`auth-cognito\` templates |

## Agents

- **Supervisor** — routes each request to the right specialist and manages state.
- **Fraud Scorer** — computes risk scores for individual transactions.
- **Investigation** — surfaces smurfing, velocity, and mule-network patterns via natural-language queries.
- **SAR** — drafts FinCEN-structured Suspicious Activity Reports.

## Deployment

Reachable from the Control Plane's Reference Implementations page. The Terraform stack provisions the AgentCore runtime, Cognito user pool, S3 sample-data bucket, and the Next.js frontend on CloudFront.`,
      },
      {
        id: 'merchant-onboarding-ref',
        title: 'Merchant Onboarding',
        content: `# Merchant Onboarding — Reference Implementation

AI-powered merchant onboarding with document processing, OFAC sanctions screening, fraud detection, and human-in-the-loop approvals. Multi-agent orchestration that cuts onboarding from 5–7 days to 1–2.

## Key capabilities

- **Document processing** — extract structured fields from KYC / business-registration docs.
- **OFAC sanctions screening** — check the applicant + beneficial owners against sanctions lists.
- **Fraud detection** — score risk based on device, address, and behavioral signals.
- **HITL approvals** — flagged cases route through the AVA Approval Queue.
- **Multi-agent orchestration** — a supervisor coordinates the specialists into an audit-ready case file.

## Deployment

Reachable from the Control Plane's Reference Implementations page. Backed by DynamoDB (application state + audit), Bedrock AgentCore (runtime), and Cognito (auth).`,
      },
      {
        id: 'sales-recommend-ref',
        title: 'Investment Research and Risk Accelerator',
        content: `# Investment Research and Risk Accelerator — Reference Implementation

**Investment Research and Risk Accelerator.** An AI research and risk-analysis assistant for capital-markets teams, running on Bedrock AgentCore.

## What it does

Given a plain-language description of a business problem, the agent recommends the right AWS services and reference architectures — a Solutions Architect on demand. Useful as a first-touch tool for pre-sales, partner enablement, or internal solutioning.

## Architecture

- **Bedrock AgentCore Runtime** — hosts the recommendation agent.
- **Frontend** — served via CloudFront (behind HTTP Basic Auth in the current deploy).
- **Retrieval** — grounded on curated AWS docs and reference architectures.

Reachable from the Control Plane's Reference Implementations page.`,
      },
      {
        id: 'agentcore-in-a-box-ref',
        title: 'AgentCore-in-a-Box',
        content: `# AgentCore-in-a-Box — Reference Implementation

Grab-and-go Bedrock AgentCore demo. **One command** deploys a governed multi-agent FS platform with every AgentCore primitive wired up, live and traceable in CloudWatch.

## Primitives wired up

- **AgentCore Runtime** — the hosting layer.
- **AgentCore Gateway** — governed tool access with Cedar policies.
- **AgentCore Memory** — semantic + episodic + summary strategies.
- **AgentCore Identity** — federated identity + IAM scoping.
- **AgentCore Observability** — CloudWatch GenAI Observability + X-Ray Transaction Search.
- **Bedrock Guardrails** — content filters + PII + denied topics.

## Why it exists

The other reference implementations demonstrate a single FSI use case in depth. AgentCore-in-a-Box demonstrates the **platform primitives** — a live, minimal reference for what "every AgentCore primitive wired up" looks like in one deployable stack. Ideal for field demos and quick internal training.

Reachable from the Control Plane's Reference Implementations page.`,
      },
    ],
  },
  {
    id: 'app-factory',
    title: 'App Factory',
    children: [
      {
        id: 'app-factory-overview',
        title: 'Overview',
        content: `# App Factory

Navigate to \`/applications/app-factory\`.

App Factory is a **5-step AI-powered wizard** that generates a complete, deployable agent application from a plain-language description of your use case. No templates to copy, no boilerplate to write — the platform uses Claude to generate agent code and Terraform, then automatically deploys the result to AgentCore Runtime via the existing CI/CD pipeline.

## 5-Step Wizard

| Step | Label | What You Provide |
|---|---|---|
| 1 | The Problem | Use case name, domain, problem statement, and current manual process |
| 2 | The Users | Who uses the agent, what a successful interaction looks like |
| 3 | The Workflow | High-level workflow steps, frequency, and human-in-the-loop requirements |
| 4 | The Data | Input data sources, expected outputs, and compliance classification |
| 5 | Constraints | Existing systems to integrate with, security and compliance constraints |

## What Gets Generated

After completing the wizard, the platform sends your answers to the backend which uses Claude to produce:
- **Agent code** — Python agent with Strands or LangGraph framework, tool definitions, and memory configuration
- **Terraform** — infrastructure module to deploy the agent to AgentCore Runtime including IAM, ECR, and endpoint configuration
- **System prompt** — tailored system prompt based on your workflow and constraint inputs

## Deployment

Once code generation completes, you can review the generated files and click **Deploy**. The platform submits the generated Terraform and agent code to the same Step Functions + CodeBuild pipeline used by FSI Foundry deployments. The deployed application appears in **My Apps** (\`/applications/my-apps\`).

## Use Case ID

App Factory slugifies your use case name into a URL-safe, AWS-resource-safe ID (lowercase, hyphens, max 32 characters). This ID is used as the prefix for all provisioned AWS resources (S3 buckets, ECR repositories, IAM roles).`,
      },
    ],
  },
  {
    id: 'templates',
    title: 'Templates',
    children: [
      {
        id: 'available-templates',
        title: 'Available Templates',
        content: `# Templates

Templates are downloadable building blocks for agent applications on AWS. They come in three tiers:

## Infrastructure Modules

Standalone Terraform projects for specific AWS resources. Download, customize \`terraform.tfvars\`, and deploy.

| Module | What It Creates |
|--------|----------------|
| **Agent Runtime — AgentCore** | Bedrock AgentCore runtime + endpoint + ECR repository + IAM |
| **Agent API Gateway** | HTTP or WebSocket API Gateway with JWT auth, throttling, CORS |
| **Auth — Cognito** | User Pool + web client + service client + resource server + groups |
| **Agent Memory — AgentCore** | AgentCore memory store + extraction strategy + IAM |
| **Agent Guardrails** | Bedrock Guardrails with content filters, PII, topics, grounding |
| **Knowledge Base — Bedrock** | Bedrock KB + OpenSearch Serverless + S3 data source |
| **Agent Observability — Langfuse** | Langfuse v2 on ECS + Aurora + Redis (downloadable standalone) |

## Code Libraries

Reusable Python patterns for both Strands and LangGraph frameworks.

| Library | What It Provides |
|---------|-----------------|
| **Agent Scaffold — Strands** | Production agent with tools, memory, AgentCore deployment |
| **Agent Scaffold — LangGraph** | ReAct agent with tools, checkpointing, AgentCore deployment |
| **Agent Test Harness** | LLM-as-judge evaluation + custom scoring |
| **Multi-Agent Kit** | Agents-as-tools, Swarm, Supervisor patterns |
| **Structured Output** | Pydantic-based typed responses from LLMs |
| **Human-in-the-Loop** | Approval gates and interrupt/resume patterns |

## Starters

Complete, deployable agent applications with both Strands and LangGraph implementations.

| Starter | Pattern |
|---------|---------|
| **Conversational Assistant** | Single agent + tools + streaming + React UI |
| **Research & Report Generator** | RAG + tools + structured output |
| **Supervisor with Specialists** | Multi-agent supervisor routing |
| **Workflow Pipeline** | Sequential deterministic pipeline |
| **Event-Driven Agent** | EventBridge-triggered agent |
| **Plan & Execute Agent** | Planning + execution + reflection |
| **Human Approval Workflow** | Agent with approval gates |
| **Evaluator-Optimizer** | Generator + critic loop |`,
      },
      {
        id: 'using-templates',
        title: 'Using Templates',
        content: `# Using Templates

## Downloading a Template

1. Navigate to **Templates** in the sidebar
2. Toggle between **Starters**, **Modules**, or **Code** tabs
3. Click a template card to view details
4. Click **Download ZIP** to get the template

## Infrastructure Modules — Quick Start

\`\`\`bash
# Unzip the downloaded template
unzip agent-runtime-agentcore.zip
cd agent-runtime-agentcore/iac/terraform

# Configure
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# Deploy
terraform init
terraform plan
terraform apply
\`\`\`

## Code Libraries — Quick Start

\`\`\`bash
# Unzip and install
unzip multi-agent-kit.zip
cd multi-agent-kit
pip install -e .

# Run the example
python -m src.strands_agents_as_tools
\`\`\`

## Starters — Quick Start

\`\`\`bash
# Unzip
unzip conversational-assistant.zip
cd conversational-assistant

# Install and run
pip install -e .
python -m src.main
# Agent starts on http://localhost:8080
\`\`\`

## Deploy to AgentCore

All agent scaffolds and starters include a Dockerfile for AgentCore deployment:

\`\`\`bash
# Build container
docker build -t my-agent .

# Push to ECR (use agent-runtime-agentcore module for ECR + runtime)
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URL
docker push $ECR_URL:v1.0.0
\`\`\``,
      },
    ],
  },
  {
    id: 'aaas-frontier',
    title: 'AaaS — Frontier Agents',
    children: [
      {
        id: 'aaas-overview',
        title: 'Overview',
        content: `# AaaS — Frontier Agents

Navigate to \`/aaas\` for the Agents-as-a-Service landing page.

AVA provides one-click deployment of **AWS-managed frontier agents** — fully operational, AWS-supported agent services that are deployed into your own account. These are not POC implementations; they are production-grade agents maintained by AWS service teams.

## Available Agents

| Agent | Route | Category |
|---|---|---|
| AWS DevOps Agent | \`/aaas/aws-agents/aws-devops\` | DevOps & Engineering |
| AWS Security Agent | \`/aaas/aws-agents/aws-security\` | Security & Compliance |

## Deployment

Each agent supports three IaC options: **Terraform**, **AWS CDK**, and **CloudFormation**. Select your preferred IaC type, configure deployment parameters, and click Deploy. The platform submits a Step Functions deployment job that runs the selected IaC in CodeBuild.

## RBAC

**Viewer** users can see the catalog and read agent descriptions but the Deploy button returns an inline 403 message. **Operator** and **Admin** users can deploy agents.

## Custom Agents

Navigate to \`/aaas/custom\` to register, deploy, and manage custom agent configurations. The Custom Agents catalog supports bring-your-own agent containers deployed to AgentCore Runtime.`,
      },
      {
        id: 'aaas-devops',
        title: 'AWS DevOps Agent',
        content: `# AWS DevOps Agent

Navigate to \`/aaas/aws-agents/aws-devops\`.

The AWS DevOps Agent automates common software development and operations tasks: code review, pipeline monitoring, incident response, and infrastructure change analysis.

## Deployment

**Supported IaC**: Terraform, AWS CDK, CloudFormation

1. Navigate to \`/aaas/aws-agents/aws-devops\`
2. Select your preferred IaC type (Terraform is recommended for first-time deployments)
3. Set the deployment name and AWS region
4. Configure required parameters (VPC ID, subnet IDs, etc.)
5. Click **Deploy** — the platform launches a CodeBuild job that runs the selected IaC

## Accessing the Agent

Once deployed, the Operator App URL appears on the deployment detail page. Click **Open Operator App** to launch the agent's web interface in a new tab. The operator app uses AWS IAM federation via the platform's federation flow (console sign-in → session chaining → operator app URL).

## Regions

Supported: us-east-1, us-east-2, us-west-2. Check the AWS DevOps Agent service page for the latest regional availability.`,
      },
      {
        id: 'aaas-security',
        title: 'AWS Security Agent',
        content: `# AWS Security Agent

Navigate to \`/aaas/aws-agents/aws-security\`.

The AWS Security Agent continuously monitors your AWS environment for security findings, correlates GuardDuty and Security Hub signals, and provides natural-language investigation workflows for security analysts.

## Deployment

**Supported IaC**: Terraform, AWS CDK, CloudFormation

1. Navigate to \`/aaas/aws-agents/aws-security\`
2. Select IaC type and region
3. Configure required parameters
4. Click **Deploy**

## One-Time SSO Setup

The Security Agent requires a one-time AWS IAM Identity Center (SSO) permission set assignment. After the initial Terraform/CDK/CFN deployment completes:

1. Open the AWS IAM Identity Center console
2. Assign the generated permission set to your SSO user or group
3. Complete the federation flow: the platform opens the AWS console sign-in tab with temporary credentials, then redirects to the Security Agent Operator App

Without the SSO setup step, the federation flow will succeed at the console but the Security Agent Operator App will return a 403 on the application-level authorization check.

## RBAC Note

**Viewer** role users will see the Deploy button but receive an inline 403 upon clicking. Only **Operator** or **Admin** users can deploy and access the agent.

## Regions

Supported: us-east-1, us-east-2, us-west-2.`,
      },
    ],
  },
  {
    id: 'capabilities',
    title: 'Capabilities',
    children: [
      {
        id: 'capabilities-overview',
        title: 'Overview',
        content: `# Capabilities

The **Capabilities** section manages the shared building blocks that agents consume at runtime: **Knowledge** sources, **Tools**, and **Prompts**. Navigate to \`/capabilities\` for the landing page.

| Capability | Route | Status |
|---|---|---|
| Knowledge | \`/capabilities/knowledge\` | Available |
| Tools | \`/capabilities/tools\` | Coming Soon |
| Prompts | \`/capabilities/prompts\` | Coming Soon |

Knowledge is the only fully-operational capability today. Tools and Prompts are in the roadmap.`,
      },
      {
        id: 'capabilities-knowledge',
        title: 'Knowledge',
        content: `# Knowledge

Navigate to \`/capabilities/knowledge\`.

The Knowledge page lets you register data sources that agents can query at runtime. Two source types are supported:

| Type | Description |
|---|---|
| **Data Lake** | S3-backed data lake with Lake Formation column-level grants, Athena workgroup, and Glue catalog |
| **Knowledge Base** | Amazon Bedrock Knowledge Base with OpenSearch Serverless vector store |

## Registration Flow

1. Click **Register Knowledge Source** and fill in the drawer form (name, type, S3 URI or KB ID, description).
2. The backend writes a DynamoDB record and starts a CodeBuild job that:
   - Provisions an AgentCore MCP server pointed at the source
   - Registers the server with the AgentCore Gateway
   - Grants the AgentCore Runtime IAM role read access via Lake Formation (Data Lake) or KB permissions (Knowledge Base)
3. The card on \`/capabilities/knowledge\` shows live status: **PROVISIONING → ACTIVE** (or **FAILED**).
4. Once **ACTIVE**, any FSI Foundry use case or App Factory application can reference the source by ID in its system prompt.

## MCP Server Details

Each registered source gets its own Model Context Protocol (MCP) server running as an AgentCore Runtime endpoint. Agents call the MCP server via the AgentCore Gateway — no direct AWS SDK calls from agent code. The gateway handles authentication, request routing, and audit logging.

## Polling

The UI polls every 8 seconds while any registration is in PROVISIONING state. You can leave the page and return — status persists in DynamoDB.`,
      },
      {
        id: 'capabilities-tools',
        title: 'Tools',
        content: `# Tools

Navigate to \`/capabilities/tools\`.

**Status: Coming Soon**

The Tools capability will allow teams to register custom tool endpoints (Lambda functions, REST APIs, MCP servers) that can be attached to any agent deployment. Registered tools will appear in the Guardrails tool-coverage dashboard and in the AgentCore Policy builder.`,
      },
      {
        id: 'capabilities-prompts',
        title: 'Prompts',
        content: `# Prompts

Navigate to \`/capabilities/prompts\`.

**Status: Coming Soon**

The Prompts capability will provide a versioned prompt registry. Teams will be able to store, version, test, and promote system prompts. Prompts will link to guardrail assignments and observability traces so you can see exactly which prompt version was active for any given agent run.`,
      },
    ],
  },
  {
    id: 'harness',
    title: 'Harness',
    children: [
      {
        id: 'harness-overview',
        title: 'Overview',
        content: `# Harness

Navigate to \`/harness\`.

**Harness** is a managed agent-loop-as-a-service that wraps AWS Bedrock AgentCore Harness. Declare the model, system prompt, tools, skills, and memory as configuration — AWS runs the orchestration loop in an isolated microVM with filesystem, shell, observability, and versioning built in. No orchestration infrastructure to run.

## Why it exists

Every agent needs the same core loop: read a prompt → call a model → parse tool calls → execute tools → feed results back → repeat until done. Writing that loop yourself (LangGraph, custom Python, etc.) means you own the retry logic, tool-call parsing, memory management, and observability plumbing. Harness delivers that loop as a managed AWS service.

## Quick start

1. Click **Create Harness** on the Harness landing page.
2. Pick a model — Claude Sonnet, Haiku, or any AgentCore-enabled Bedrock model.
3. Paste a system prompt describing the agent's role.
4. Attach tools (MCP servers), skills, memory namespaces, and (optionally) an AgentCore Gateway for governed tool access.
5. Click **Test** to stream a live conversation. Every message streams via SSE.

## Built-in features

- **Managed memory** — attach a memory namespace and the loop persists context across sessions.
- **Guardrails** — Bedrock Guardrails run as \`during_call\` hooks on every model turn.
- **Session isolation** — each run gets its own microVM with a scratch filesystem.
- **Versioning + endpoints** — every save is versioned; a stable invoke endpoint follows the latest \`v\` you pick.
- **Observability** — spans + logs flow to CloudWatch and (if wired) Langfuse.

## Publishing to the Registry

A deployed Harness can be published as an AGENT record in the AVA registry so it becomes discoverable in Registry → Agents (\`recordType=AGENT\`, tag \`Kind=agent\`). Downstream agents can then call it via MCP without hardcoding an ARN.`,
      },
    ],
  },
  {
    id: 'memory',
    title: 'Memory',
    children: [
      {
        id: 'memory-overview',
        title: 'Overview',
        content: `# Memory

Navigate to \`/memory\`.

**Memory** is the managed persistent-context layer for agents, backed by Bedrock AgentCore Memory. Attach a memory namespace to any agent at deploy time and the agent can read and write across turns without you managing the underlying store, embeddings, or vector index.

## Extraction strategies

Each memory namespace declares how new turns are distilled into stored records. Three strategies are supported out of the box:

- **Semantic** — extract facts about entities (user preferences, account details, past decisions) and store them keyed by entity ID for retrieval on future turns.
- **Episodic** — store full conversation turns with time and session metadata; retrieval returns the most relevant prior episodes.
- **Summary** — periodically summarize older turns so the working context stays bounded even in long-running sessions.

You can mix strategies within one namespace — e.g. semantic + summary for a customer-service agent that needs both structured facts and rolling context.

## Attaching memory to an agent

Memory namespaces show up in the Harness create form and in every Foundry use case's runtime configuration. Attaching one wires the agent's tool-call loop to \`bedrock-agentcore-memory:*\` calls on your behalf. IAM is scoped per namespace.

## Cross-agent memory

Multiple agents can share a namespace, which is how you build teams of agents that recall the same customer history without a hand-rolled sync mechanism. Access control is enforced at the namespace level via IAM.`,
      },
    ],
  },
  {
    id: 'registry',
    title: 'Registry',
    children: [
      {
        id: 'registry-overview',
        title: 'Overview',
        content: `# Registry

Navigate to \`/registry\`.

**One registry. Every resource.** The AVA namespace on AWS Agent Registry is the discovery layer for everything an agent might reach for at runtime — other agents, MCP servers, A2A peers, skills, and free-form custom resources.

## Five typed record kinds

- **Agents** — recordType=AGENT with tag \`Kind=agent\`. Runtime-bound / MCP-callable peers.
- **MCP Servers** — recordType=MCP with descriptor \`mcpServer\` v2025-12-11.
- **A2A Agents** — recordType=AGENT with tag \`Kind=a2a\`, descriptor \`a2aAgentCard\` v0.3. A2A-protocol peers with AgentCards.
- **Skills** — recordType=SKILL with descriptor \`agentSkillsDefinition\` v0.1.0.
- **Custom Resources** — recordType=CUSTOM with a free-form descriptor for anything not modeled natively.

Every kind shares one control-plane surface, one approval flow, and one audit trail.

## Approval-aware publish flow

Every registration consults the Approval Policy engine before writing. If a matching policy has \`mode=auto_approve\`, the record is created + submitted + approved in one transaction. If \`mode=require_approval\`, the record lands as \`PENDING_APPROVAL\` and an Approval Queue row opens. Deny returns 403 with the denying policy's reason.

## Auto-publish on deploy

Every Foundry / reference app that deploys through the Control Plane becomes an AGENT record automatically. An EventBridge rule on the deployment Step Function's SUCCEEDED events fires a Lambda that publishes the record with tag \`Source=foundry-deploy\` and \`DeploymentId=<uuid>\`. Idempotent — re-runs skip if the DeploymentId is already published.`,
      },
      {
        id: 'registry-agents',
        title: 'Agents',
        content: `# Registry → Agents

Navigate to \`/registry/agents\`.

Autonomous peer agents catalogued in the AVA registry — the runtime-bound / MCP-callable / auto-registered agents your applications delegate to. Distinct from **A2A Agents** (see next), which are A2A-protocol peers with AgentCards.

## Curated tab

Ships with 4 curated frontier agents:

- **AWS DevOps Agent** — troubleshoots pipeline failures, rollbacks, and CloudFormation drift.
- **AWS Security Agent** — investigates GuardDuty / Security Hub / IAM Access Analyzer findings.
- **Kiro (Dev Agent)** — code review, unit-test drafting, refactor suggestions.
- **Sample FSI KYC Agent** — deployable FSI Foundry KYC triage reference.

Click **Deploy to Registry** on any curated card to publish it as an AGENT record (recordType=AGENT + tag Kind=agent) — the policy engine decides whether it auto-approves or routes through the Approval Queue.

## My Agents tab

Every registered agent (curated deploys + custom registrations + auto-published Foundry deploys) shows here with Name / Runtime / Capabilities / Status / Source / Updated. Deprecate any record inline — it stays in the registry as DEPRECATED for audit.

## Auto-published deploys

Successful Foundry / reference-app deploys auto-publish here via the EventBridge → Lambda hook. Look for the \`Source=foundry-deploy\` tag on the record.`,
      },
      {
        id: 'registry-mcp',
        title: 'MCP Servers',
        content: `# Registry → MCP Servers

Navigate to \`/mcp\`.

Register MCP-compliant tool servers — hosted or self-hosted. Publish once; every agent in your organization can consume them without re-configuring endpoints or credentials.

## Fields

- **Name / URL** — display label and MCP endpoint (\`https://.../mcp\`).
- **Auth hint** — none / api_key / oauth2 / bearer / sigv4. Tells consuming agents how to authenticate.
- **Delegation mode** — m2m (machine-to-machine) or obo (on-behalf-of).
- **Category / Tags** — free-form for filtering.

## Curated tab

Ships with a set of well-known MCP servers (AWS Documentation, GitLab, and others) that any user can deploy to the registry with one click.

## Descriptor

The record's descriptor is \`mcpServer\` v2025-12-11 — matches AWS Agent Registry's canonical MCP server schema. AVA-specific extras (\`curated_id\`, \`auth_hint\`, \`header_name\`, \`header_value\`) live under \`_meta.ava\` so top-level fields stay schema-valid.`,
      },
      {
        id: 'registry-a2a',
        title: 'A2A Agents',
        content: `# Registry → A2A Agents

Navigate to \`/a2a\`.

Register A2A-protocol agents — the peers your agents delegate to via the A2A protocol. Distinct from Registry → Agents (which are runtime-bound / MCP-callable). A2A peers ship with an **AgentCard** — a JSON manifest of capabilities, input/output modes, and skills — that consuming agents fetch at plan time.

## Fields

- **Name / Endpoint** — display label and A2A base URL. The AgentCard is fetched from \`/.well-known/agent.json\` at register time.
- **Description / Category / Tags** — free-form.
- **Auth hint** — none / api_key / oauth2 / bearer / sigv4.
- **Delegation mode** — m2m or obo.

## Curated tab

Ships with reference A2A peers from AWS, Google, and Anthropic — vetted starting points for common patterns (research, extraction, evaluation).

## AgentCard preview

The Create form fetches the AgentCard from your endpoint's well-known URL and previews it inline before registration. That way you know exactly what capabilities you're publishing.

## Descriptor

The record's descriptor is \`a2aAgentCard\` v0.3 — the full AgentCard JSON travels inside the record's \`data\` field. AVA extras live under \`_meta.ava\` so the top-level AgentCard schema passes validation.`,
      },
      {
        id: 'registry-skills',
        title: 'Skills',
        content: `# Registry → Skills

Navigate to \`/registry/skills\`.

Reusable capabilities agents can equip — evaluation rubrics, extraction schemas, workflow templates, guardrail clauses. Distinct from **Tools** (MCP endpoints): skills carry *procedural knowledge*, not endpoint access.

## Curated tab

Ships with 6 canonical skills covering the most common agentic patterns:

- **1-to-5 Scoring Rubric** — general-purpose LLM-as-judge grading.
- **KYC Triage Decision** — multi-step KYC screening with sanctions/PEP lookup and regulation citation.
- Extraction schemas, workflow templates, guardrail templates — deployable with one click.

## Kinds

- **evaluation** — scoring rubrics for LLM-as-judge or human review.
- **extraction** — structured-output schemas.
- **workflow** — multi-step procedural knowledge.
- **guardrail** — content / behavior clauses.

## Descriptor

The record's descriptor is \`agentSkillsDefinition\` v0.1.0. Because the AWS schema allows only \`{_meta?, repository?, websiteUrl?, packages?}\`, AVA extras (name, kind, description, input variables, output schema, tags, posture) live under \`_meta.ava\` so the top-level payload passes validation.`,
      },
      {
        id: 'registry-custom-resources',
        title: 'Custom Resources',
        content: `# Registry → Custom Resources

Navigate to \`/registry/custom-resources\`.

The escape hatch. Register anything worth cataloging that doesn't fit the four typed shapes — knowledge bases, prompt libraries, eval harnesses, agent-invokable Lambdas, deployment templates, dataset catalogs.

## Descriptor

Records use the \`custom\` descriptor — a single \`data\` field carrying free-form JSON. Unlike the four typed descriptors, \`custom\` does NOT accept a \`dataSchemaVersion\` field — the AVA UI reconstructs the metadata (name, kind, description, tags, arbitrary metadata) from the payload on read.

## Metadata

- **Name / Kind** — display label and a free-form category label (e.g. \`knowledge-base\`, \`prompt-lib\`, \`eval-suite\`).
- **Description / Tags** — free-form for discovery.
- **Metadata** — arbitrary JSON blob.

## Approval flow

Custom records route through the same approval flow as typed records — the default policy \`AVA Default: Custom Resource register requires OPERATOR\` gates registration through the Approval Queue.`,
      },
    ],
  },
  {
    id: 'catalog',
    title: 'Catalog',
    children: [
      {
        id: 'catalog-overview',
        title: 'Overview',
        content: `# Catalog

Navigate to \`/catalog\`.

The unified inventory of every resource across Build. One page to answer: "what's actually running, and is it approved?"

## Sections (locked display order)

Resources are grouped and rendered in this exact order:

1. **Applications** — deployed FSI Foundry apps, reference implementations, app-factory outputs.
2. **Harnesses** — deployed AgentCore Harnesses.
3. **Memory** — registered AgentCore Memory namespaces.
4. **Agents** — Registry → Agents (recordType=AGENT + tag \`Kind=agent\`).
5. **Frontier Agents** — deployed AaaS Frontier Agents.
6. **MCP Servers** — recordType=MCP.
7. **A2A Agents** — recordType=AGENT + tag \`Kind=a2a\`.
8. **Custom Agents** — deployed AaaS Custom Agents.
9. **Templates** — deployed app templates.
10. **AgentCore Runtimes** — every AgentCore Runtime in the account.

## Registry column

Every row shows its AWS Agent Registry state as a colored pill:

- **✓ Active** — record is APPROVED in the registry.
- **⧗ Pending** — DRAFT or PENDING_APPROVAL — waiting on a queue decision.
- **✕ Rejected** — REJECTED by an approver.
- **· Deprecated** — DEPRECATED (kept for audit but not in discovery).
- **– Not in Registry** — deployed but not published (older deploys, pre-hook resources).
- **n/a** — the resource kind doesn't participate in the registry (e.g. Templates).

## Filters

Filter by section, by registry state, or by name. The one place to audit what's live end-to-end.`,
      },
    ],
  },
  {
    id: 'secure',
    title: 'Secure',
    children: [
      {
        id: 'secure-overview',
        title: 'Overview',
        content: `# Secure

The **Secure** section provides two complementary layers of agent safety. Navigate to \`/secure\` for the landing page.

## Two Layers of Defense

| Layer | Component | What It Controls |
|---|---|---|
| **Content-level** | Guardrails | What agents say and receive — topic blocks, PII filtering, prompt injection guards, grounding checks |
| **Resource-level** | AgentCore Policy | What agents can do and access — Cedar policies enforced by the AgentCore Policy Engine and Platform Gateway |

Using both together gives you defense-in-depth: Guardrails intercept harmful content before it reaches or leaves the model; policies prevent agents from taking unauthorized actions regardless of what the model decides.

## Navigation

| Route | Description |
|---|---|
| \`/secure/guardrails\` | My Guardrails — list, manage, assign existing guardrails |
| \`/secure/guardrails/create\` | Guardrail Builder — create a new guardrail from scratch |
| \`/secure/guardrails/fsi-library\` | FSI Template Library — pre-built guardrails for FSI scenarios |
| \`/secure/guardrails/playground\` | Live Preview — test a guardrail against sample inputs in real time |
| \`/secure/guardrails/observability\` | Coverage & Audit — see which agents have guardrails and review triggered events |
| \`/secure/guardrails/tools\` | Tool Utilities — version history, comparison, import/export, regex builder |
| \`/secure/policy\` | My Policies — list and manage Cedar policies |
| \`/secure/policy/create\` | Policy Builder — create a new Cedar policy |
| \`/secure/policy/audit\` | Policy Audit Log — full history of policy evaluations |`,
      },
      {
        id: 'secure-guardrails',
        title: 'Guardrails',
        content: `# Guardrails

Guardrails are content-level safety filters applied at the Amazon Bedrock layer. They intercept both incoming prompts and outgoing model responses.

## Tabs

### My Guardrails (\`/secure/guardrails\`)
Lists all guardrails you have created. Each card shows the guardrail's active status, assigned agents, and last triggered timestamp. Click a guardrail to view configuration detail or re-assign it.

### Guardrail Builder (\`/secure/guardrails/create\`)
Step-by-step builder for creating a new guardrail. Configure:
- **Denied Topics** — subjects the agent must refuse to discuss
- **Content Filters** — violence, hate speech, sexual content, and insults (each with adjustable threshold)
- **PII Redaction** — detect and redact or block 20+ PII entity types (SSN, credit card, account number, etc.)
- **Grounding Threshold** — minimum factual-grounding score before a response is blocked
- **Prompt Attack Guard** — jailbreak and prompt injection detection

### FSI Template Library (\`/secure/guardrails/fsi-library\`)
Pre-built guardrail configurations covering common FSI scenarios: trading advice restrictions, MNPI handling, customer data PII, regulatory disclosure requirements, and more. Select a template to use it as a starting point in the builder.

### Playground (\`/secure/guardrails/playground\`)
Live Preview lets you test any guardrail configuration against sample inputs without deploying. Enter a prompt and see exactly which filter triggered, the action taken (blocked vs. redacted), and the confidence score.

### Observability (\`/secure/guardrails/observability\`)
The Observability tab inside Guardrails shows:
- **Coverage Dashboard** — which deployed agents have guardrails assigned vs. unprotected
- **Real-time Feed** — live stream of guardrail trigger events
- **Metrics Dashboard** — trigger rates, top denied topics, PII hit rates over time
- **Compliance Reports** — exportable summaries for audit
- **Audit Trail** — immutable log of every guardrail event

### Tools (\`/secure/guardrails/tools\`)
Utility panel with: version history, side-by-side comparison of two guardrail versions, import/export (JSON), automated reasoning panel, regex pattern builder, denied-topics builder, and grounding threshold tuner.`,
      },
      {
        id: 'secure-policy',
        title: 'Policy Management',
        content: `# Policy Management

Policy Management provides resource-level access control for agents using Cedar policies enforced by the Amazon Bedrock AgentCore Policy Engine.

## How It Works

Policies define what actions an agent identity is **permitted** or **forbidden** to perform. At runtime, the AgentCore Gateway evaluates every tool call against the active policy set before forwarding it to the tool endpoint. A denied action returns a 403 and is logged.

## Policy Language

Policies are written in **Cedar** — a purpose-built policy language designed for application-level authorization. Cedar policies are:
- Typed and statically analyzable
- Fast to evaluate (microsecond latency)
- Auditable — every evaluation produces a structured log entry

## Tabs

### My Policies (\`/secure/policy\`)
Lists all policies in the system. Filter by principal (agent ID), resource (tool or knowledge source), or action. Each policy shows its effect (permit/forbid), principal, resource, and last evaluation timestamp.

### Policy Builder (\`/secure/policy/create\`)
Visual Cedar policy builder. Set:
- **Principal** — which agent or role the policy applies to
- **Action** — which tool call or operation is being controlled
- **Resource** — which specific tool endpoint, knowledge source, or service
- **Conditions** — optional attribute-based conditions (e.g., time of day, environment)

FSI policy presets are available for common patterns: read-only market data access, PII handling restrictions, production environment isolation.

### Audit Log (\`/secure/policy/audit\`)
Immutable log of every policy evaluation — permit and deny. Each entry records: timestamp, agent ID, action, resource, policy that matched, and outcome. Exportable for compliance reporting.`,
      },
      {
        id: 'secure-llm-gateway',
        title: 'LLM Gateway',
        content: `# LLM Gateway

Navigate to \`/secure/llm-gateway\`.

The **LLM Gateway** is the single chokepoint every Bedrock model call passes through — built on [LiteLLM](https://github.com/BerriAI/litellm), deployed on ECS Fargate with Aurora PostgreSQL and ElastiCache Valkey. Every agent points at one \`LITELLM_BASE_URL\` and Govern reads live FinOps + Audit data from here.

## Tabs

- **Overview** — health at a glance: gateway status, aggregate spend, rate-limit hits, top models.
- **Config** — SSM-backed live \`config.yaml\`. Add or remove models without redeploying the container.
- **Models** — the catalog fronted by the gateway. Attach Bedrock Guardrails per model as a \`during_call\` hook.
- **Virtual Keys** — issue per-agent / per-team API keys with individual budgets and rate limits.
- **Spend** — live token / cost breakdown per key, per model, per day.
- **Audit** — every model call recorded — prompt, response, latency, cost, guardrail verdict.
- **Playground** — hit the gateway inline to test a virtual key + prompt.

## Why it matters

Any agent that talks to Bedrock through this proxy inherits observability, budget enforcement, guardrails, and audit for free. If it doesn't go through the gateway, Govern can't see it — that's why the recommended baseline is: every agent, every call, one \`LITELLM_BASE_URL\`.`,
      },
      {
        id: 'secure-identity',
        title: 'Identity',
        content: `# Identity

Navigate to \`/secure/identity\`.

Federate external identity providers — Microsoft Entra ID, Okta, Auth0, or any generic OIDC provider — and map their group claims to AVA roles. Enterprise SSO drops in without a Cognito rebuild.

## Flow

1. Click **Register provider** and pick a preset (Entra / Okta / Auth0 / OIDC).
2. Enter the OIDC issuer URL. AVA fetches the discovery document (\`/.well-known/openid-configuration\`) inline so you can verify authorization / token / JWKS endpoints before saving.
3. Configure Auth Code + PKCE — client ID, redirect URI, scopes.
4. Map group claims to AVA roles: which claim carries group membership (\`groups\`, \`roles\`, \`cognito:groups\`) and which group values map to \`ADMIN\` / \`OPERATOR\` / \`VIEWER\`.

## Discovery Test

The Register form has a **Test discovery** button that fetches the issuer's discovery endpoint and shows the parsed metadata inline. Use it before saving to confirm the endpoint is reachable and returns the expected shape.

## Approval flow

Identity Provider registrations route through the Approval Queue by default (AVA Default: Identity provider register requires ADMIN). The record lives in DynamoDB (\`identity_providers\` table), not the AWS Agent Registry — but the approval flow uses the same queue-row shape for consistency.`,
      },
      {
        id: 'secure-approval-policies',
        title: 'Approval Policies',
        content: `# Approval Policies

Navigate to \`/secure/approval-policies\`.

Human-in-the-loop rules for sensitive actions. Declare which resource + action combinations require a human sign-off, from whom, and by when. Requests appear in the **Operate → Approval Queue** for on-call operators.

## Policy shape

Each policy has:

- **Resource kind** — \`application\` / \`harness\` / \`memory\` / \`mcp\` / \`a2a\` / \`agent\` / \`skill\` / \`custom\` / \`identity\` (or \`*\` for any).
- **Resource pattern** — glob-style match against the resource id (e.g. \`prod-*\`, \`fsi-*\`, \`*\`).
- **Action verb** — \`deploy\` / \`delete\` / \`invoke\` / \`update\` / \`register\` (or \`*\`).
- **Mode** — \`auto_approve\` / \`require_approval\` / \`deny\`.
- **Required role** — \`ADMIN\` / \`OPERATOR\` (for require_approval).
- **Quorum** — how many approvers are required (v1 flips on the first vote).
- **SLA hours** — auto-expire request if not decided by then.

## Priority resolution

If multiple policies match, the engine resolves by (in order): mode strictness (deny > require_approval > auto_approve) → pattern specificity (fewer wildcards wins) → required-role strictness (ADMIN > OPERATOR). The winning policy's mode and role are what the queue row carries.

## AVA Default policies

Eight policies seed on backend boot. Display order matches the seed script:

1. Agent register requires OPERATOR
2. MCP register requires OPERATOR
3. A2A register requires OPERATOR
4. Skills register requires OPERATOR
5. Custom Resource register requires OPERATOR
6. Application deploy auto-approves
7. Application delete requires ADMIN
8. Identity provider register requires ADMIN

## Live enforcement

Registrations for MCP Servers, A2A Agents, Agents, Skills, Custom Resources, and Identity Providers all consult the engine before writing. Application deploy is enforced by the deployment route; delete is currently informational. Live queue rows land in **Operate → Approval Queue**.`,
      },
    ],
  },
  {
    id: 'operate',
    title: 'Operate',
    children: [
      {
        id: 'operate-overview',
        title: 'Overview',
        content: `# Operate

Five operational surfaces, one platform. Every deployed agent lands here for launch tracking, dual observability, prompt iteration, and human sign-off.

- **Deployments** — every CodeBuild + CloudFormation run in one queue.
- **AgentCore Observability** — AWS-native traces via CloudWatch GenAI Observability + X-Ray. See the [Observability](#observability) section.
- **Langfuse Observability** — self-hosted Langfuse v3 with prompt versioning, evaluations, cost analytics. See the [Observability](#observability) section.
- **Prompt Optimization** — Bedrock Advanced Prompt Optimization: seed → variants → winner → promote to Harness.
- **Approval Queue** — live inbox of HITL sign-offs from the Approval Policy engine.

Navigate to \`/operate\` for the 5-tile landing page.`,
      },
      {
        id: 'operate-deployments',
        title: 'Deployments',
        content: `# Deployments

Navigate to \`/deployments\`.

Every CodeBuild + CloudFormation run kicked off from AVA — reference apps, harness updates, FSI Foundry deploys — in one queue. No jumping between AWS consoles.

## Row detail

Each row shows the deployment name, template, status, and last updated timestamp. Statuses come from the deployment Step Function's DDB rows: \`created\` → \`packaged\` → \`delivered\` → \`deploying\` → \`deployed\` / \`failed\`.

## Deployment detail page

Click any row for the full detail view:

- **Streamed logs** — live tail from CodeBuild via CloudWatch Logs.
- **Artifact URLs** — deployed frontend, backend, or AgentCore runtime endpoints.
- **Outputs** — every IaC output captured (agent_runtime_arn, ui_url, guardrail_id, etc.).
- **Actions** — Redeploy / Destroy from the same page.

## Auto-publish to Registry

On successful DEPLOY, the deployment Step Function's \`SUCCEEDED\` event fires an EventBridge rule that invokes a Lambda. The Lambda reads the deployment record from DDB and publishes it as an AGENT record in the AVA Registry (\`recordType=AGENT\`, tag \`Kind=agent\`, \`Source=foundry-deploy\`). Idempotent — a re-run skips if a record with the same \`DeploymentId\` tag exists.`,
      },
      {
        id: 'operate-prompt-optimization',
        title: 'Prompt Optimization',
        content: `# Prompt Optimization

Navigate to \`/prompt-optimization\`.

Bedrock **Advanced Prompt Optimization** wrapped in a Control Plane workflow. Submit a seed prompt + labeled evaluation dataset; Bedrock generates candidate variants, scores each, and returns the winner. One-click promote to your Harness.

## Workflow

1. **Dataset Builder** — upload JSONL with \`{input, expected_output}\` pairs, or point at an existing dataset.
2. **Optimization Job** — submit a seed prompt + the model + the dataset. Job runs asynchronously.
3. **Candidate Compare** — side-by-side comparison of each variant against the same dataset row, with per-row and aggregate scores.
4. **Promote to Harness** — one-click write of the winning variant to the target Harness's system prompt.

## Backing services

Backed by \`api/routes/advpo.py\` and the \`infrastructure/modules/advanced_prompt_optimization/\` TF module — S3 bucket for datasets + jobs, IAM role, Bedrock permissions.

## Closing the loop

Feed evaluation datasets from Langfuse into Prompt Optimization to improve prompts against your own scoring, then promote back to Harness. That's the "improve" leg of the Ship → Watch → Improve loop.`,
      },
      {
        id: 'operate-approval-queue',
        title: 'Approval Queue',
        content: `# Approval Queue

Navigate to \`/operate/approvals\`.

Live inbox of pending HITL sign-offs produced by the Approval Policy engine (see **Secure → Approval Policies**). Every row shows the requester, target resource, action, matched policy, and time remaining under the SLA.

## Actions

- **Approve** / **Deny** — per-row inline actions. Comment on each decision.
- **Batch approve / batch deny** — select up to 200 rows with the checkbox column and decide them in one call.
- **Simulate** — open a synthetic request to end-to-end-test the flow without registering anything real.

## What happens on Approve

For queue rows created by registry publishes (\`resource_kind = registry_record:{mcp,a2a,agent,skill,custom}\`), approving flips the linked AWS Agent Registry record's status:

- \`DRAFT\` → \`PENDING_APPROVAL\` → \`APPROVED\` (auto-recovers if the record is stuck in DRAFT because \`submit-for-approval\` races with CREATING).
- If it's an Identity Provider row, the DDB record's \`status\` flips to \`active\`.

## SLA + expiry

Each row carries an \`expires_at\` computed from the matching policy's \`sla_hours\`. Rows past their SLA can be swept to \`expired\` via a scheduled task (v2).

## History

Approved / denied / expired rows stay in the table for audit — filter by status to see the full history.`,
      },
    ],
  },
  {
    id: 'observability',
    title: 'Observability',
    children: [
      {
        id: 'observability-overview',
        title: 'Overview',
        content: `# Observability

AVA provides two complementary observability options. Navigate to \`/observability\` for the landing page where both options are presented.

## Two Options

| Option | Route | Best For |
|---|---|---|
| **Langfuse** | \`/observability/langfuse\` | Deep LLM tracing — prompt versions, token costs, evaluations, multi-turn conversations |
| **AgentCore Observability** | \`/observability/agentcore\` | Native AWS tracing — X-Ray spans + CloudWatch Logs, no extra infrastructure |

You can enable both simultaneously. They emit different signals and complement each other: Langfuse adds evaluation pipelines and per-run cost analytics; AgentCore adds X-Ray latency histograms and CloudWatch log correlation.

## Choosing Between Them

Use **Langfuse** when you need:
- Prompt version tracking across model experiments
- LLM-as-judge evaluation runs
- Per-session cost attribution and token analytics
- OpenTelemetry export to third-party tools

Use **AgentCore Observability** when you need:
- Zero-setup observability (opt-in checkbox, no SDK changes)
- X-Ray service map and latency percentiles
- CloudWatch Logs Insights queries across agent logs
- AWS-native integration with CloudWatch alarms and dashboards`,
      },
      {
        id: 'observability-langfuse',
        title: 'Langfuse',
        content: `# Langfuse

Navigate to \`/observability/langfuse\`.

Langfuse is an open-source LLM observability platform. AVA deploys a self-hosted Langfuse instance as part of the **foundation-stack** Terraform module (ECS + Aurora + Redis). It is not provisioned by default — enable it by setting \`langfuse_enabled = true\` in \`terraform.tfvars\` before running \`deploy-full.sh\`.

## What Langfuse Captures

- **Traces** — full end-to-end trace for every agent run, including all LLM calls, tool invocations, and latency breakdowns
- **Prompts** — versioned prompt registry linked to traces so you can see exactly which prompt version produced a given output
- **Evaluations** — LLM-as-judge scoring pipeline; define a rubric and run batch evaluations against historical traces
- **Costs** — token usage and estimated cost per trace, session, and model

## Setup

1. Set \`langfuse_enabled = true\` in \`terraform.tfvars\`
2. Run \`./deploy-full.sh\` (or \`terraform apply\` in the foundation-stack module)
3. Terraform outputs the Langfuse URL, API key, and secret key
4. Set those values in the AVA backend environment variables (\`LANGFUSE_HOST\`, \`LANGFUSE_PUBLIC_KEY\`, \`LANGFUSE_SECRET_KEY\`)
5. Navigate to \`/observability/langfuse\` to open the Langfuse UI embedded in AVA

## OpenTelemetry Export

Langfuse supports the OTLP HTTP exporter. To send traces to a third-party backend (Grafana, Jaeger, Datadog), configure the \`OTEL_EXPORTER_OTLP_ENDPOINT\` environment variable on the ECS task.`,
      },
      {
        id: 'observability-agentcore',
        title: 'AgentCore Observability',
        content: `# AgentCore Observability

Navigate to \`/observability/agentcore\`.

AgentCore Observability provides native AWS tracing for agents deployed to Amazon Bedrock AgentCore Runtime. It uses **X-Ray Transaction Search** and **CloudWatch Logs** — no additional SDK instrumentation or infrastructure required.

## Important: Opt-In Per Deployment

AgentCore Observability is **opt-in per deployment**. It is NOT automatically enabled for all agents. When deploying an FSI Foundry use case via the pipeline, check the **"Enable AgentCore Observability"** checkbox in the deployment form. This sets the \`observability_enabled\` flag in the CodeBuild job environment, which instructs the AgentCore Runtime to emit X-Ray traces.

Agents deployed without the checkbox will not appear in X-Ray Transaction Search. This is by design — some teams prefer to avoid the additional CloudWatch and X-Ray ingest costs.

## What AgentCore Observability Captures

- **X-Ray Transaction Search** — end-to-end spans for each agent invocation with \`agent_id\` annotation, latency breakdown, and error classification
- **CloudWatch Logs** — structured JSON logs for every tool call, model invocation, and agent state transition

## Prerequisites

Before enabling AgentCore Observability in any AWS account, X-Ray Transaction Search must be turned on once at the account level:

\`\`\`bash
aws xray put-encryption-config --type NONE --region <your-region>
# Then enable Transaction Search in the X-Ray console
\`\`\`

## Viewing Traces

1. Navigate to \`/observability/agentcore\`
2. The page embeds links to X-Ray Transaction Search filtered to your agent fleet
3. Click any trace row to jump to the full X-Ray service map for that invocation
4. Use the CloudWatch Logs tab to run Insights queries across all agent logs`,
      },
    ],
  },
  {
    id: 'govern',
    title: 'Govern',
    children: [
      {
        id: 'govern-overview',
        title: 'Overview',
        content: `# Govern

The **Govern** module is the AI GRC (Governance, Risk, Compliance) hub for the AVA platform. It provides visibility into your AI estate, control over what it can do, and evidence to demonstrate compliance to auditors and regulators.

Navigate to \`/govern\` for the hub landing page.

## Govern Core: See It, Govern It, Show It

Nine foundational modules organized into three pillars that together provide ~66% coverage across 8 major AI governance frameworks.

| Pillar | Question | Core Modules |
|--------|----------|--------------|
| **See It** | What AI do we have? What's it doing? What's it costing? | Command Center, Agent Registry, Agentic Fleet, Model Management, Cost & FinOps |
| **Govern It** | Who can do what? What rules are enforced? | Compliance Center, Prompt Governance |
| **Show It** | What happened? Can we demonstrate compliance? | Audit & Incidents, Data Governance |

Core modules are marked with a star badge in the UI. Use the "Core Only" filter on the landing page to focus on foundational capabilities.

## Regulatory Frameworks Supported

| Framework | Coverage | Description |
|---|---|---|
| **OWASP LLM Top 10** | ~80% | LLM security risks (prompt injection, info disclosure, etc.) |
| **FINOS AIR** | ~75% | FSI GenAI governance (operational, security, regulatory) |
| **CRI FS AI RMF** | ~75% | Comprehensive FSI AI risk management |
| **OSFI E-23** | ~75% | Canadian model risk management guideline |
| **SR 26-2** | Full | Federal Reserve AI/ML model risk guidance |
| **NIST AI RMF** | Full | NIST AI Risk Management Framework |
| **ISO 42001** | ~75% | AI Management Systems standard |
| **EU AI Act** | ~80% | Risk classification, conformity requirements, GPAI Model Cards |
| **MITRE ATLAS** | ~65% | Adversarial AI threat tactics |
| **NAIC AI** | ~70% | Insurance AI model bulletin, Unfair Discrimination Testing |

## All Modules

| Module | Route | Pillar |
|--------|-------|--------|
| Command Center | \`/govern/command-center\` | See It (Core) |
| Agent Registry | \`/govern/agents\` | See It (Core) |
| Agentic Fleet | \`/govern/fleet\` | See It (Core) |
| Model Management | \`/govern/models\` | See It (Core) |
| Cost & FinOps | \`/govern/finops\` | See It (Core) |
| Compliance Center | \`/govern/compliance\` | Govern It (Core) |
| Prompt Governance | \`/govern/prompt-governance\` | Govern It (Core) |
| Audit & Incidents | \`/govern/audit\` | Show It (Core) |
| Data Governance | \`/govern/data\` | Show It (Core) |
| Risk Management | \`/govern/risk\` | Add-on |
| AI Safety | \`/govern/safety\` | Add-on |
| Shadow AI | \`/govern/shadow-ai\` | Add-on |
| Developer AI | \`/govern/developer-ai\` | Add-on |
| Governance Playbook | \`/govern/playbook\` | Add-on |
| Multi-Cloud | \`/govern/multi-cloud\` | Add-on |
| Agentic Coding | \`/govern/dev-tools\` | Add-on |
| Trust Stack | \`/govern/trust-stack\` | Add-on |

## Live Data Integration

All Govern modules follow a cascading fallback pattern:

1. **Live** — Real data from AWS APIs (Cost Explorer, Bedrock, CloudTrail, Security Hub)
2. **Computed** — Derived from live data (e.g., risk scores from agent status)
3. **Mock** — Illustrative data when backend is disconnected

Visual indicators show data source: \`Live\` badge for real AWS data, \`Mock\` badge for illustrative data.`,
      },
      {
        id: 'govern-command-center',
        title: 'Command Center',
        content: `# Command Center

Navigate to \`/govern/command-center\`. **Core Module (See It)**

The Command Center is the single pane of glass for AI governance, aggregating real-time signals from across the platform.

## Features

- **Trust Scores** — Composite governance scores across the agent fleet
- **Compliance Posture** — Live compliance percentage with drill-down
- **Risk Exposure** — Active incidents, findings, and alerts
- **Real-Time Refresh** — Auto-updates every 60 seconds
- **Module Deep Links** — Click any KPI to navigate to source module

## Live Data Sources

Aggregates from 9+ govern APIs: \`governAgentCoreApi\`, \`governGuardrailsApi\`, \`governSecurityApi\`, \`governCostApi\`, \`guardrailsApi\`, \`policiesApi\`, \`maturityApi\`, \`deploymentsApi\`, \`governAuditApi\`

## Use Cases

- Daily operations review for AI platform team
- Executive reporting and board presentations
- Incident triage starting point`,
      },
      {
        id: 'govern-agent-registry',
        title: 'Agent Registry',
        content: `# Agent Registry

Navigate to \`/govern/agents\`. **Core Module (See It)**

Centralized inventory of all AI agents, tools, MCP servers, capabilities, and permissions across AWS, Azure, GCP, and SaaS platforms.

## Tabs

| Tab | Description |
|-----|-------------|
| **Agents** | Registry with capabilities, scope, owner, rate limits, incidents |
| **Fleet Scale** | Registry at scale (10k+ agents) with filtering and search |
| **Attack Surface** | Threat modeling view with agent-to-tool mappings |
| **Tools** | Tool inventory with risk levels and authorized agents |
| **MCP Servers** | Server inventory with auth method and health status |
| **Permissions** | Agent-to-tool authorization matrix |
| **Human Oversight** | HITL gate configuration per agent |
| **A2A Governance** | Agent-to-agent trust policies |
| **Evaluations** | AgentCore evaluation results |
| **Providers** | Multi-cloud provider connectivity status |

## Live Data Sources

- \`governAgentCoreApi.agents()\` — Bedrock AgentCore discovery
- \`deploymentsApi.list()\` — AVA deployments
- \`frontierAgentsApi.list()\` — AWS-managed agents

## Features

- Automatic discovery of Bedrock agents
- Multi-cloud support (AWS, Azure, GCP, SaaS)
- Risk tier classification per agent
- Autonomy level tracking (L0-L4)`,
      },
      {
        id: 'govern-fleet',
        title: 'Agentic Fleet',
        content: `# Agentic Fleet

Navigate to \`/govern/fleet\`. **Core Module (See It)**

Fleet-wide governance dashboard with KPIs, risk heatmap, emergency controls, and guardrail observability.

## Features

- **5-Pillar Control Plane** — Registry, Access, Visualization, Interop, Security posture
- **Fleet Risk Heatmap** — Risk scores by use case aligned to AWS Scoping Matrix
- **Emergency Controls** — Kill, Throttle, LOG_ONLY, Restart actions
- **Guardrail Observability** — Real-time guardrail intervention metrics
- **OWASP Agentic Threats** — Alignment to OWASP threat model

## Live Data Sources

- \`governAgentCoreApi.agents()\` — Agent discovery and status
- Computed risk heatmap from agent compliance status and platform type

## Use Cases

- Fleet-wide incident response
- Governance posture reviews
- Risk-based agent prioritization`,
      },
      {
        id: 'govern-model-management',
        title: 'Model Management',
        content: `# Model Management

Navigate to \`/govern/models\`. **Core Module (See It)**

Comprehensive model governance hub with registry, evaluations, explainability, compliance, and operations.

## Tabs

| Tab | Description |
|-----|-------------|
| **Dashboard** | Live data, KPIs, cost alerts, drift indicators |
| **Registry** | Model inventory with risk tiers and governance status |
| **Evaluations** | Model evals, RAG evals, deployment gate |
| **Explainability** | Attribution analysis, bias & fairness testing |
| **Compliance** | Governance lifecycle, attestations |
| **Operations** | Monitoring, dependency graph, analysis tools |

## Sub-Features

- **Hallucination Detection** — Ground truth comparison
- **MRM Framework Explorer** — Model Risk Management alignment
- **Model Comparison** — Side-by-side capability analysis
- **Risk Scoring Calculator** — Interactive risk tier computation
- **Dependency Graph** — Model-to-agent relationship visualization

## Live Data Sources

- \`governModelsApi.catalog()\` — Bedrock foundation model catalog
- \`governModelsApi.runtimeMetrics()\` — Model invocation metrics
- \`governCostApi.byModel()\` — Per-model cost breakdown
- \`governEvalsApi.jobs()\` — Bedrock evaluation job results`,
      },
      {
        id: 'govern-finops',
        title: 'Cost & FinOps',
        content: `# Cost & FinOps

Navigate to \`/govern/finops\`. **Core Module (See It)**

AI cost management with budget tracking, spend velocity, anomaly detection, and optimization recommendations.

## Tabs

| Tab | Description |
|-----|-------------|
| **Dashboard** | Real-time spend, KPIs, trend charts |
| **Planning** | Use case cost editor and projections |
| **ROI** | Agent ROI calculator with value metrics |
| **Task Fit** | Task assessment for AI suitability |
| **Business Metrics** | Business value tracking |
| **Unit Economics** | Per-invocation cost analysis |
| **Token Economics** | Token usage patterns and optimization |
| **Chargeback** | Cost allocation by tag/business unit |
| **Optimization** | Savings recommendations |

## Live Data Sources

- \`governCostApi.summary()\` — Aggregate AI spend
- \`governCostApi.trend()\` — Historical spend trends
- \`governCostApi.forecast()\` — Spend projections
- \`governCostApi.byModel()\` — Per-model breakdown
- \`governCostApi.byUseCase()\` — Per-use-case breakdown
- \`governCostApi.byTag()\` — Cost allocation tag breakdown
- \`governCostApi.tagKeys()\` — Available cost allocation tags
- \`governCostApi.anomalies()\` — Spend anomaly detection
- \`governCostApi.budgets()\` — AWS Budgets integration

## Features

- Real AWS Cost Explorer integration
- Anomaly detection with alerts
- Tag-based chargeback with selector
- Budget vs actual variance tracking`,
      },
      {
        id: 'govern-compliance',
        title: 'Compliance Center',
        content: `# Compliance Center

Navigate to \`/govern/compliance\`. **Core Module (Govern It)**

Interactive compliance framework management with checklists, attestations, and policy observability.

## Features

- **Compliance Posture Strip** — Live compliance percentage with breakdown
- **Governance Program Builder** — 6-phase wizard for program setup
- **Framework Checklists** — Interactive control tracking per framework
- **Evidence Attachment** — Link documents and artifacts to controls
- **Attestation Management** — Track control attestations and expiry
- **Config Rules View** — AWS Config rule compliance
- **Policy Observability** — Cedar ALLOW/DENY decision audit
- **ISO 42001 Certification Tracker** — 7-phase certification journey (Gap Analysis to Certification Decision) with readiness tracking
- **Conformity Assessment Workflow** — EU AI Act Article 43 multi-step workflow (see Conformity tab)
- **FRIA Wizard** — EU AI Act Article 27 Fundamental Rights Impact Assessment (see FRIA tab)
- **Compliance Gap Guidance** — "Beyond the Platform" guidance for non-technical gaps (see Gap Guidance tab)

## Conformity Assessment Workflow (EU AI Act Article 43)

Located in the **Conformity** tab. A 6-step workflow for EU AI Act conformity assessment:

| Step | Description |
|------|-------------|
| **Risk Classification** | Determine AI system risk tier (Unacceptable, High-Risk, Limited, Minimal) |
| **Technical Documentation** | Compile required technical documentation per Annex IV |
| **QMS Verification** | Verify Quality Management System compliance per Article 17 |
| **Post-Market Monitoring** | Establish post-market monitoring plan per Article 72 |
| **Declaration of Conformity** | Prepare EU Declaration of Conformity per Article 47 |
| **CE Marking Readiness** | Verify CE marking eligibility per Article 48 |

**Features:**
- Per-step tracking: status, evidence checklist, responsible party, target dates, notes
- Visual workflow diagram with clickable nodes
- Progress tracker with overall completion percentage

## FRIA Wizard (EU AI Act Article 27)

Located in the **FRIA** tab. Fundamental Rights Impact Assessment for high-risk AI systems.

**8 Fundamental Rights Areas:**
- Human dignity
- Privacy and data protection
- Non-discrimination
- Gender equality
- Right to effective remedy
- Freedom of expression
- Right to good administration
- Workers' rights

**Features:**
- Per-right assessment: impact level, mitigation measures, residual risk rating, evidence links
- Overall FRIA score calculation (0-100)
- High-risk AI systems view (Annex III categories)
- Export report capability
- Auto-save drafts

## Compliance Gap Guidance

Located in the **Gap Guidance** tab. "Beyond the Platform" guidance for compliance gaps that require organizational (non-technical) remediation.

**Features:**
- **Platform vs Organization Split** — Shows what the platform provides vs what the organization must do
- **Interactive Checklist** — Track progress on organizational gaps with completion status
- **Framework-Specific Guidance** — Tailored guidance for EU AI Act, ISO 42001, NAIC AI, and other frameworks
- **Progress Tracking** — Overall completion percentage for non-technical requirements

Also integrated into EU AI Act, ISO 42001, and NAIC AI framework views for contextual gap guidance.

## NAIC AI: Unfair Discrimination Testing

Integrated into the NAIC AI framework view. Addresses NAIC Model Bulletin unfair discrimination requirements for insurance AI.

**Features:**
- **6 Protected Class Tests** — Age, Race, Gender, Religion, National Origin, Disability
- **Disparate Impact Ratio** — Automated 4/5ths rule calculation per protected class
- **Proxy Variable Correlation** — Analyze correlation between model features and protected classes
- **Use Case Selector** — Context-specific testing for Underwriting, Claims, Pricing, Marketing
- **Pass/Fail Status** — Clear compliance status per protected class with remediation guidance

## EU AI Act: GPAI Model Cards

Integrated into the EU AI Act framework view. Art. 53 transparency documentation for General-Purpose AI models.

**8 Documentation Sections:**
- **Identity** — Model name, version, provider identification
- **Intended Use** — Designed use cases and deployment contexts
- **Training Data** — Data sources, size, preprocessing methods
- **Capabilities** — Model capabilities and performance characteristics
- **Evaluations** — Benchmark results and evaluation methodology
- **Compute** — Training compute resources and energy consumption
- **Mitigations** — Safety measures and risk mitigations implemented
- **Known Issues** — Known limitations, failure modes, and biases

**Additional Features:**
- **Systemic Risk Assessment** — Art. 51/55 systemic risk evaluation for high-capability models
- **Export Capability** — Generate compliance-ready GPAI model card documents

## Supported Frameworks

SR 26-2, NIST AI RMF, EU AI Act, CRI FS AI RMF, OSFI E-23, ISO 42001, OWASP LLM Top 10, MITRE ATLAS, NAIC AI, FINOS AIR

## Live Data Sources

- \`governPostureApi.configRuleDetail()\` — AWS Config compliance
- \`governConformanceApi\` — Conformance tracking
- \`complianceApi\` — Attestation management
- \`policiesApi.getObservability()\` — Cedar policy decisions
- \`maturityApi\` — Plan maturity assessments`,
      },
      {
        id: 'govern-prompt-governance',
        title: 'Prompt Governance',
        content: `# Prompt Governance

Navigate to \`/govern/prompt-governance\`. **Core Module (Govern It)**

AWS-native prompt compliance built on Bedrock Guardrails with 4-layer defense architecture.

## 4-Layer Defense

| Layer | Latency | Description |
|-------|---------|-------------|
| **Real-Time Guardrails** | <50ms | Bedrock native content filters |
| **Contextual Evaluation** | 50-200ms | Grounding & relevance checks |
| **Async Observability** | Background | Athena queries, trend analysis |
| **Formal Verification** | Background | Automated Reasoning proofs |

## Views

| View | Description |
|------|-------------|
| **Live Guardrails** | Active guardrail configurations from Bedrock |
| **Invocations** | Real-time invocation telemetry |
| **Heatmap** | Violation patterns by category |
| **Scorecard** | Metrics summary |
| **AgentCore** | Agent-specific metrics |
| **Analytics** | Trend analysis and reporting |

## Live Data Sources

- \`guardrailsApi.list()\` — Bedrock guardrail configurations
- \`governGuardrailsApi.telemetry()\` — Guardrail intervention metrics
- \`governInvocationSafetyApi.telemetry()\` — Invocation safety metrics

## Guardrail Types

- Content filters (hate, sexual, violence, misconduct)
- PII detection and anonymization
- Denied topic policies
- Contextual grounding checks
- Prompt attack detection`,
      },
      {
        id: 'govern-audit',
        title: 'Audit & Incidents',
        content: `# Audit & Incidents

Navigate to \`/govern/audit\`. **Core Module (Show It)**

Guardrail activity feed, incident management, audit logs, and compliance evidence.

## Views

| View | Description |
|------|-------------|
| **Metrics** | Scorecard contribution (MTTR, open incidents, resolution rate) |
| **Audit Trail** | Event log with filtering, search, and export |

## Event Types Captured

- Guardrail trigger events
- Policy enforcement decisions (Cedar ALLOW/DENY)
- Agent invocation logs
- Configuration changes
- Incident lifecycle events

## Features

- **Live AI Activity** — Real-time CloudTrail AI events
- **Policy Observability** — Cedar decision audit trail
- **Trace Viewer** — Debug individual invocations
- **Evidence Export** — CSV/JSON for auditors
- **Incident Lifecycle** — Detect → Investigate → Resolve workflow

## Live Data Sources

- \`governAuditApi.list()\` — Audit event log
- \`governTrailApi.aiActivity()\` — CloudTrail Bedrock events
- \`governTrailApi.aiCallers()\` — AI caller analysis`,
      },
      {
        id: 'govern-data',
        title: 'Data Governance',
        content: `# Data Governance

Navigate to \`/govern/data\`. **Core Module (Show It)**

Data quality, lineage, provenance, domains, and access control for AI-ready data.

## Tabs

| Tab | Description |
|-----|-------------|
| **Dashboard** | KPIs, sensitivity breakdown, domain coverage |
| **Lineage** | Data flow visualization |
| **Quality** | Rule-based quality scoring |
| **Knowledge** | Knowledge source registry with RAG Security Controls (OWASP LLM08 aligned, 8 controls) |
| **Assessment** | Data maturity assessment |

## Sub-Routes

| Route | Description |
|-------|-------------|
| \`/govern/data/quality\` | Data quality rules and scores |
| \`/govern/data/metadata\` | Metadata management |
| \`/govern/data/maturity\` | Data maturity assessment |
| \`/govern/data/readiness\` | AI readiness scoring |
| \`/govern/data/lineage\` | Data lineage visualization |
| \`/govern/data/agents\` | Agent data profiles |
| \`/govern/data/access\` | Access control policies |
| \`/govern/data/ontology\` | Data ontology editor |
| \`/govern/data/taxonomy\` | Data taxonomy management |
| \`/govern/data/glossary\` | Business glossary |
| \`/govern/data/graphrag\` | GraphRAG visualization |

## Live Data Sources

- \`governDataCatalogApi\` — Glue Data Catalog integration
- \`governDataSourcesApi\` — Registered data sources
- \`knowledgeApi.list()\` — Knowledge registrations
- \`knowledgeApi.listDatabases()\` — Glue databases
- \`knowledgeApi.listKnowledgeBases()\` — Bedrock knowledge bases`,
      },
      {
        id: 'govern-additional',
        title: 'Additional Modules',
        content: `# Additional Modules

Beyond the 9 Core modules, Govern includes specialized capabilities for advanced use cases.

## Risk Management
\`/govern/risk\`

Enterprise risk register with heatmaps, assessments, controls library, and issue tracking aligned to NIST AI RMF.

**Tabs:** Dashboard, Risk Register, Assessments, Controls, Issues, Third-Party Risk, HRAIS, Outcomes

**Outcome Monitoring Dashboard (Outcomes Tab):**
- **Post-Deployment AI Impact Tracking** — Monitor AI system outcomes after deployment
- **Decision Distribution Analysis** — Track how AI decisions are distributed across populations
- **Demographic Parity Metrics** — Measure fairness across protected classes
- **Appeal Rate Monitoring** — Track appeal rates and outcomes for AI decisions
- **Drift Detection** — Detect model drift and outcome shifts over time
- **Consumer Harm Indicators** — Aligned to CRI FS AI RMF harm categories

**Third-Party Risk Tab Features:**
- **Concentration Risk Analysis** — Vendor dependency breakdown showing % of agents/models per provider
- **Single-Vendor Exposure Alerts** — Critical alerts (>70% concentration), High alerts (>50%)
- **Exit Strategy Tracking** — Monitor portability plans for concentrated vendor dependencies

## AI Safety
\`/govern/safety\`

Capability safety and assurance organized on AWS's 8 Responsible-AI dimensions.

**Sub-routes:**
- \`/govern/safety/evals\` — Safety evaluations
- \`/govern/safety/redteam-pipeline\` — Red team testing
- \`/govern/safety/capabilities\` — Frontier capability thresholds
- \`/govern/safety/safety-cases\` — Safety case documentation
- \`/govern/safety/incidents\` — Incident management
- \`/govern/safety/runtime\` — Runtime safety controls
- \`/govern/threat-modeling\` — MAESTRO threat modeling

## Shadow AI
\`/govern/shadow-ai\`

Discover unapproved agents, models, tools, and API keys before they become incidents.

**Live Data:** \`governDeveloperAiApi.usage()\` shadow_ai detection

## Developer AI Usage
\`/govern/developer-ai\`

Monitor developer AI tool consumption (tokens, cost), detect anomalies and shadow usage.

**Live Data:** \`governDeveloperAiApi.usage()\` team and user breakdown

## Governance Playbook
\`/govern/playbook\`

Decision framework for autonomous agents with autonomy levels (L0-L4), HITL gates, and A2A trust policies.

## Multi-Cloud
\`/govern/multi-cloud\`

Unified governance across AWS Bedrock, Azure AI Foundry, Google Vertex AI, and SaaS platforms.

**Live Data:** \`governCostApi.providerConnectors()\` connectivity status

## Agentic Coding
\`/govern/dev-tools\`

Governance for AI-powered coding assistants (Claude Code, Kiro, Copilot, Cursor).

**Live Data:** \`governDeveloperAiApi.usage()\` developer tool metrics

## Trust Stack
\`/govern/trust-stack\`

Visualizes the 3-layer governance architecture: Content Safety → Access Control → Audit & Observability.`,
      },
    ],
  },
  {
    id: 'infrastructure',
    title: 'Infrastructure',
    children: [
      {
        id: 'architecture',
        title: 'Architecture',
        content: `# Infrastructure Architecture

## AWS Services

| Service | Purpose |
|---------|---------|
| **ECS Fargate** | Runs FastAPI backend with auto-scaling |
| **API Gateway** | HTTP API with VPC Link to ALB |
| **CloudFront** | CDN for React frontend |
| **DynamoDB** | Deployment tracking and application catalog |
| **S3** | Frontend hosting and deployment packages |
| **Step Functions** | Deployment pipeline orchestration |
| **CodeBuild** | CI/CD execution environment |
| **Cognito** | User authentication and authorization |
| **ECR** | Container registry |
| **CloudWatch** | Logging, metrics, and monitoring |

## Terraform Modules

The control plane infrastructure is organized into 13 Terraform modules:

- **Networking**: VPC, subnets, NAT, security groups
- **DynamoDB**: Application catalog and deployment tables
- **S3**: Buckets for frontend, archives, and deployment packages
- **ECR**: Container registry for backend
- **ECS**: Fargate cluster and service
- **API Gateway**: HTTP API with VPC Link
- **Step Functions**: Deployment orchestration state machine
- **CodeBuild**: Build environment for IaC execution
- **EventBridge**: Event routing
- **State Backend**: S3 + DynamoDB for Terraform state
- **Cognito**: User pools and authentication
- **CloudFront**: CDN distribution
- **Observability**: CloudWatch dashboards and alarms`,
      },
      {
        id: 'deployment-pipeline',
        title: 'Deployment Pipeline',
        content: `# Deployment Pipeline

## Pipeline Architecture

The deployment pipeline uses AWS Step Functions to orchestrate CodeBuild jobs that provision infrastructure and deploy applications.

## Step Functions States

1. **ValidateInput** — Verify template and parameters
2. **UpdateStatusValidating** — Update deployment status
3. **PackageTemplate** — Package application code and IaC
4. **StartBuild** — Initiate CodeBuild job
5. **InvokeCodeBuild** — Execute build with environment variables
6. **StoreBuildId** — Save build ID for log retrieval
7. **MonitorBuild** — Poll build status (30-second intervals)
8. **EvaluateBuildStatus** — Check success or failure
9. **CaptureOutputs** — Read deployment outputs from S3
10. **RecordSuccess** — Update status to deployed with outputs
11. **RecordFailureWrite** — Record error details on failure
12. **FailState** — Terminal error state

## CodeBuild Execution

CodeBuild runs on ARM64 with Docker support and executes multi-stage deployments:

**Stage 1: Infrastructure**
- Terraform creates ECR repository, IAM roles, S3 buckets
- Approximately 32 AWS resources

**Stage 2: Docker Build**
- Builds application container image
- Pushes to ECR repository

**Stage 3: Runtime**
- Deploys AgentCore runtime via CloudFormation
- Configures runtime with container image

## Monitoring

- **Real-time Status**: UI displays pipeline progress
- **CloudWatch Logs**: Full build logs available
- **DynamoDB**: Deployment history and outputs stored permanently`,
      },
    ],
  },
  {
    id: 'api-reference',
    title: 'API Reference',
    children: [
      {
        id: 'templates-api',
        title: 'Templates API',
        content: `# Templates API

## List Templates

\`\`\`
GET /api/v1/templates
\`\`\`

**Query Parameters:**
- \`pattern_type\`: Filter by pattern (single_agent, orchestration, tool_calling, rag)
- \`framework\`: Filter by framework (strands, langraph)
- \`deployment_pattern\`: Filter by IaC (terraform, cdk, cloudformation)
- \`template_type\`: Filter by type (foundation, usecase)

**Response:**
\`\`\`json
{
  "templates": [
    {
      "id": "strands-agentcore",
      "name": "Strands Agent on AgentCore",
      "type": "usecase",
      "pattern_type": "single_agent",
      "frameworks": ["strands"],
      "deployment_patterns": ["terraform", "cdk", "cloudformation"]
    }
  ]
}
\`\`\`

## Get Template Details

\`\`\`
GET /api/v1/templates/{template_id}
\`\`\`

Returns full template metadata including parameters, outputs, and dependencies.

## Get Catalog Stats

\`\`\`
GET /api/v1/templates/stats
\`\`\`

Returns summary statistics about available templates.`,
      },
      {
        id: 'applications-api',
        title: 'Applications API',
        content: `# Applications API

## List FSI Foundry Use Cases

\`\`\`
GET /api/v1/applications/foundry/use-cases
\`\`\`

Returns all 34 FSI Foundry use cases with metadata.

**Response:**
\`\`\`json
{
  "use_cases": [
    {
      "id": "fraud_detection",
      "name": "Fraud Detection",
      "domain": "Risk & Compliance",
      "description": "Multi-agent fraud detection and investigation",
      "frameworks": ["strands", "langchain_langgraph"]
    }
  ]
}
\`\`\`

## Deploy FSI Foundry Use Case

\`\`\`
POST /api/v1/applications/foundry/deploy
\`\`\`

**Request Body:**
\`\`\`json
{
  "deployment_name": "fraud-detection-prod",
  "use_case_id": "fraud_detection",
  "framework": "strands",
  "aws_region": "us-east-1",
  "parameters": {
    "model_id": "anthropic.claude-haiku-4-5-20251001-v1:0"
  }
}
\`\`\`

Starts the deployment pipeline and returns deployment ID.`,
      },
      {
        id: 'deployments-api',
        title: 'Deployments API',
        content: `# Deployments API

## Create Deployment

\`\`\`
POST /api/v1/deployments
\`\`\`

**Request Body:**
\`\`\`json
{
  "deployment_name": "my-agent",
  "template_id": "strands-agentcore",
  "iac_type": "terraform",
  "framework_id": "strands",
  "aws_region": "us-east-1",
  "parameters": {
    "project_name": "my-agent",
    "model_id": "anthropic.claude-haiku-4-5-20251001-v1:0"
  }
}
\`\`\`

**Requires:** \`operator\` role

## List Deployments

\`\`\`
GET /api/v1/deployments?status=deployed&template_id=strands-agentcore
\`\`\`

**Query Parameters:**
- \`status\`: Filter by status (pending, validating, deploying, deployed, failed)
- \`template_id\`: Filter by template

## Get Deployment Details

\`\`\`
GET /api/v1/deployments/{deployment_id}
\`\`\`

Returns full deployment information including:
- Current status
- Status history
- CloudWatch log stream
- Deployment outputs (runtime ARN, ECR repository, etc.)

## Delete Deployment

\`\`\`
DELETE /api/v1/deployments/{deployment_id}
\`\`\`

Triggers teardown pipeline to destroy all provisioned resources.`,
      },
      {
        id: 'authentication',
        title: 'Authentication',
        content: `# Authentication & Authorization

## Authentication

The platform uses AWS Cognito for user authentication:
- OAuth 2.0 flow
- JWT token-based authentication
- Token validation on all API requests

## Authorization (RBAC)

Two user roles are supported:

**Operator Role**
- View templates and use cases
- Create and manage deployments
- View deployment history and logs

**Viewer Role**
- View templates and use cases
- View deployment history
- Cannot create or delete deployments

## Using the API

Include the JWT token in the Authorization header:

\`\`\`bash
curl -H "Authorization: Bearer <JWT_TOKEN>" \\
  https://api.example.com/api/v1/templates
\`\`\``,
      },
    ],
  },
];

// Simple markdown renderer
function renderMarkdown(md: string) {
  const lines = md.split('\n');
  const html: string[] = [];
  let inCode = false;
  let inTable = false;
  let codeBlock: string[] = [];
  let tableRows: string[] = [];
  let codeLanguage = '';

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        // Check if it's a mermaid diagram
        if (codeLanguage.startsWith('diagram:')) {
          const diagramName = codeLanguage.slice('diagram:'.length).trim();
          const svgContent = diagrams[diagramName];
          if (svgContent) {
            html.push(`<div class="my-6 bg-slate-50 rounded-xl border border-slate-200 p-6 overflow-x-auto flex justify-center diagram-container">${svgContent}</div>`);
          } else {
            html.push(`<div class="my-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">Diagram not found: ${diagramName}</div>`);
          }
          codeBlock = [];
          codeLanguage = '';
          inCode = false;
          continue;
        } else {
          html.push(`<pre class="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto text-sm my-4 border border-slate-800"><code>${codeBlock.join('\n').replace(/</g, '&lt;')}</code></pre>`);
        }
        codeBlock = [];
        codeLanguage = '';
      } else {
        // Starting a code block - check for language
        codeLanguage = line.slice(3).trim();
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) { codeBlock.push(line); continue; }

    if (line.startsWith('|') && line.includes('|')) {
      if (!inTable) { inTable = true; tableRows = []; }
      if (line.match(/^\|[\s-|]+\|$/)) continue;
      tableRows.push(line);
      continue;
    } else if (inTable) {
      inTable = false;
      const headerCells = tableRows[0].split('|').filter(c => c.trim());
      const bodyRows = tableRows.slice(1);
      let table = '<div class="overflow-x-auto my-4"><table class="w-full text-sm border-collapse">';
      table += '<thead><tr class="bg-slate-50">' + headerCells.map(c => `<th class="border border-slate-200 px-3 py-2.5 text-left font-semibold text-slate-700">${c.trim().replace(/\*\*/g, '')}</th>`).join('') + '</tr></thead><tbody>';
      for (const row of bodyRows) {
        const cells = row.split('|').filter(c => c.trim());
        table += '<tr class="hover:bg-slate-50/50 transition-colors">' + cells.map(c => `<td class="border border-slate-200 px-3 py-2.5 text-slate-600">${c.trim().replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-800">$1</strong>').replace(/\`(.*?)\`/g, '<code class="bg-slate-100 px-1.5 py-0.5 rounded text-xs text-blue-700 font-mono">$1</code>')}</td>`).join('') + '</tr>';
      }
      table += '</tbody></table></div>';
      html.push(table);
      tableRows = [];
    }

    if (line.startsWith('# ')) html.push(`<h1 class="text-3xl font-semibold text-slate-900 mb-4 mt-8 tracking-tight">${line.slice(2)}</h1>`);
    else if (line.startsWith('## ')) html.push(`<h2 class="text-2xl font-bold text-slate-900 mb-3 mt-8">${line.slice(3)}</h2>`);
    else if (line.startsWith('### ')) html.push(`<h3 class="text-lg font-semibold text-slate-900 mb-2 mt-5">${line.slice(4)}</h3>`);
    else if (line.startsWith('- ')) html.push(`<li class="ml-4 text-slate-600 mb-1.5 list-disc list-inside leading-relaxed">${line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-800">$1</strong>').replace(/\`(.*?)\`/g, '<code class="bg-slate-100 px-1.5 py-0.5 rounded text-xs text-blue-700 font-mono">$1</code>')}</li>`);
    else if (line.startsWith('> ')) html.push(`<blockquote class="border-l-4 border-amber-400 bg-amber-50/50 pl-4 pr-4 py-3 my-4 rounded-r-xl text-slate-700">${line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</blockquote>`);
    else if (line.trim() === '') html.push('<div class="h-2"></div>');
    else html.push(`<p class="text-slate-600 leading-relaxed mb-2">${line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-800">$1</strong>').replace(/\`(.*?)\`/g, '<code class="bg-slate-100 px-1.5 py-0.5 rounded text-xs text-blue-700 font-mono">$1</code>')}</p>`);
  }

  if (inTable && tableRows.length) {
    const headerCells = tableRows[0].split('|').filter(c => c.trim());
    const bodyRows = tableRows.slice(1);
    let table = '<div class="overflow-x-auto my-4"><table class="w-full text-sm border-collapse">';
    table += '<thead><tr class="bg-slate-50">' + headerCells.map(c => `<th class="border border-slate-200 px-3 py-2.5 text-left font-semibold text-slate-700">${c.trim().replace(/\*\*/g, '')}</th>`).join('') + '</tr></thead><tbody>';
    for (const row of bodyRows) {
      const cells = row.split('|').filter(c => c.trim());
      table += '<tr class="hover:bg-slate-50/50 transition-colors">' + cells.map(c => `<td class="border border-slate-200 px-3 py-2.5 text-slate-600">${c.trim().replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-800">$1</strong>').replace(/\`(.*?)\`/g, '<code class="bg-slate-100 px-1.5 py-0.5 rounded text-xs text-blue-700 font-mono">$1</code>')}</td>`).join('') + '</tr>';
    }
    table += '</tbody></table></div>';
    html.push(table);
  }

  return html.join('\n');
}

export default function Documentation() {
  const { section } = useParams<{ section?: string }>();
  const [activeId, setActiveId] = useState(section || 'overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showFloatingButton, setShowFloatingButton] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['fsi-foundry']));

  // Deep link: when URL param changes, navigate to that section and expand parents
  useEffect(() => {
    if (!section) return;
    setActiveId(section);
    // Auto-expand parent sections so the nav item is visible
    const expandParents = (sections: DocSection[], targetId: string, parents: string[] = []): string[] | null => {
      for (const s of sections) {
        if (s.id === targetId) return parents;
        if (s.children) {
          const found = expandParents(s.children, targetId, [...parents, s.id]);
          if (found) return found;
        }
      }
      return null;
    };
    const parents = expandParents(docs, section);
    if (parents) {
      setExpandedSections(prev => {
        const next = new Set(prev);
        parents.forEach(p => next.add(p));
        return next;
      });
    }
  }, [section]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const findContent = (sections: DocSection[], id: string): string | undefined => {
    for (const s of sections) {
      if (s.id === id) return s.content;
      if (s.children) {
        const found = findContent(s.children, id);
        if (found) return found;
      }
    }
  };

  const content = findContent(docs, activeId) || '';

  // Show floating button when scrolled down
  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    const scrollTop = (e.target as HTMLElement).scrollTop;
    setShowFloatingButton(scrollTop > 100);
  };

  return (
    <div className="h-[calc(100vh-4rem)] bg-white flex relative overflow-hidden">
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - fixed height with independent scroll */}
      <aside className={`
        w-64 flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto
        fixed lg:relative inset-y-0 left-0 z-40 lg:z-auto transform transition-transform duration-300 shadow-xl lg:shadow-none
        h-full
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-6">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">Documentation</h2>
          <nav className="space-y-1">
            {docs.map((section) => (
              <div key={section.id} className="mb-4">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-2">
                  {section.title}
                </div>
                {section.children?.map((child) => (
                  <div key={child.id}>
                    {/* If child has sub-children (domain category), show expandable button */}
                    {child.children && child.children.length > 0 ? (
                      <>
                        <button
                          onClick={() => toggleSection(child.id)}
                          className="w-full flex items-center justify-between text-left px-3 py-2 rounded-xl text-sm text-slate-700 hover:bg-slate-100 transition-all duration-150 font-medium"
                        >
                          <span>{child.title}</span>
                          <svg
                            className={`w-4 h-4 transition-transform duration-200 ${expandedSections.has(child.id) ? 'rotate-90' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        {/* Show nested children when expanded */}
                        {expandedSections.has(child.id) && (
                          <div className="ml-3 mt-1 space-y-1 border-l-2 border-slate-200 pl-2">
                            {child.children.map((subChild) => (
                              <div key={subChild.id}>
                                {/* If sub-child has its own children (use case with pages), show expandable */}
                                {subChild.children && subChild.children.length > 0 ? (
                                  <>
                                    <button
                                      onClick={() => toggleSection(subChild.id)}
                                      className="w-full flex items-center justify-between text-left px-2 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-all duration-150"
                                    >
                                      <span>{subChild.title}</span>
                                      <svg
                                        className={`w-3.5 h-3.5 transition-transform duration-200 ${expandedSections.has(subChild.id) ? 'rotate-90' : ''}`}
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                      </svg>
                                    </button>
                                    {/* Show use case detail pages when expanded */}
                                    {expandedSections.has(subChild.id) && (
                                      <div className="ml-2 mt-1 space-y-0.5">
                                        {subChild.children.map((detailPage) => (
                                          <button
                                            key={detailPage.id}
                                            onClick={() => {
                                              setActiveId(detailPage.id);
                                              setSidebarOpen(false);
                                            }}
                                            className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-all duration-150 ${
                                              activeId === detailPage.id
                                                ? 'bg-blue-50 text-blue-700 font-semibold'
                                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                            }`}
                                          >
                                            {detailPage.title}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  /* Single-page use case - clickable directly */
                                  <button
                                    onClick={() => {
                                      setActiveId(subChild.id);
                                      setSidebarOpen(false);
                                    }}
                                    className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-all duration-150 ${
                                      activeId === subChild.id
                                        ? 'bg-blue-50 text-blue-700 font-semibold'
                                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                    }`}
                                  >
                                    {subChild.title}
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      /* Regular page without children - clickable directly */
                      <button
                        onClick={() => {
                          setActiveId(child.id);
                          setSidebarOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all duration-150 ${
                          activeId === child.id
                            ? 'bg-blue-50 text-blue-700 font-semibold'
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        {child.title}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </nav>
        </div>
      </aside>

      {/* Content - independent scroll */}
      <main className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {/* Mobile menu button at top */}
        <div className="lg:hidden sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
            Documentation Menu
          </button>
        </div>

        <div className="max-w-4xl mx-auto px-6 lg:px-10 py-12">
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
        </div>
      </main>

      {/* Floating button - outside scroll container, mobile only */}
      {showFloatingButton && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden fixed bottom-6 right-6 z-50 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all animate-fade-in"
          aria-label="Open documentation menu"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
      )}
    </div>
  );
}
