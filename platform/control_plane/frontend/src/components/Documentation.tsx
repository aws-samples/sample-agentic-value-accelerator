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

The Agentic Value Accelerator (AVA) is a production-grade control plane for deploying and managing AI agent applications for financial services on AWS.

## What You Get

- **34 Production-Ready Use Cases** — Multi-agent FSI applications across Banking, Risk, Capital Markets, Insurance, Operations, and Modernization
- **Dual Framework Support** — Every use case implemented in both Strands Agent SDK and LangChain/LangGraph (68 total implementations)
- **Automated CI/CD** — Step Functions + CodeBuild pipeline provisions all infrastructure and deploys applications
- **Template Scaffolding** — 6 templates for building custom agent applications with Terraform, CDK, or CloudFormation
- **Control Plane UI** — React frontend for browsing, configuring, and deploying applications

## Architecture

**Control Plane Components:**
- **Frontend**: React + TypeScript UI served via CloudFront
- **Backend**: FastAPI on ECS Fargate with DynamoDB and S3
- **Infrastructure**: 13 Terraform modules managing all AWS resources
- **Deployment Pipeline**: Step Functions orchestration with CodeBuild execution

**Application Layer:**
- **FSI Foundry**: 34 use cases × 2 frameworks = 68 implementations
- **Templates**: 6 scaffolding templates for custom development
- **Shared Foundations**: Reusable infrastructure modules (networking, observability, IAM, ECR)`,
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

## 1. Deploy Control Plane Infrastructure

\`\`\`bash
cd platform/control_plane/infrastructure
terraform init
terraform apply

# Note the outputs: ECR_URL, API_ENDPOINT, FRONTEND_BUCKET, CLOUDFRONT_DIST_ID
\`\`\`

## 2. Deploy Backend

\`\`\`bash
cd ../
docker buildx build --platform linux/amd64 \\
  -f backend/Dockerfile \\
  -t <ECR_URL>:latest --push .

# Force ECS to redeploy
aws ecs update-service --cluster <CLUSTER> --service <SERVICE> --force-new-deployment
\`\`\`

## 3. Deploy Frontend

\`\`\`bash
cd frontend
echo "VITE_API_URL=<API_ENDPOINT>" > .env.production
npm install
npm run build
aws s3 sync dist/ s3://<FRONTEND_BUCKET>/ --delete
aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths "/*"
\`\`\`

## 4. Access the Platform

Navigate to the CloudFront URL and sign in. You can now:
- Browse FSI Foundry use cases
- Deploy applications via the automated pipeline
- Create custom projects from templates`,
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

FSI Foundry provides **34 production-ready multi-agent applications** across 6 financial services domains. Each use case has implementations in both Strands and LangGraph frameworks.

## What You Get

- **68 Total Implementations**: 34 use cases × 2 frameworks (Strands + LangGraph)
- **Multi-Agent Orchestration**: Coordinated specialist agents for complex workflows
- **Production-Ready**: Tested architectures with sample data and deployment scripts
- **Flexible Deployment**: Deploy to Amazon Bedrock AgentCore via automated CI/CD pipeline

## Domains

- **Banking** (6 use cases) — Customer onboarding, engagement, and payment automation
- **Risk & Compliance** (4 use cases) — Fraud detection, compliance investigation, adverse media screening
- **Capital Markets** (7 use cases) — Trading, investment advisory, research
- **Insurance** (2 use cases) — Claims processing and life insurance agent assistance
- **Operations** (11 use cases) — Document processing, analytics, communication automation
- **Modernization** (4 use cases) — Legacy migration and economic research

## Framework Support

Every use case includes dual implementations:
- **Strands Agent SDK**: AWS-native framework with Bedrock integration
- **LangChain/LangGraph**: Graph-based orchestration with state machines

## Deployment Process

1. Select use case in the UI
2. Choose framework (Strands or LangGraph)
3. Configure deployment parameters
4. Deploy via automated pipeline (Step Functions + CodeBuild)

The platform automatically provisions all infrastructure: ECR, IAM roles, S3 buckets, and AgentCore runtime.`,
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

Coordinates specialist agents to produce production-ready code from requirements. Ensures code quality, test coverage, and architectural consistency.

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
    id: 'templates',
    title: 'Templates',
    children: [
      {
        id: 'available-templates',
        title: 'Available Templates',
        content: `# Templates

Templates are scaffolding tools for building custom agent applications. Each template includes infrastructure-as-code, agent framework implementations, and deployment scripts.

## Foundation Templates (2)

**Networking Base**
- VPC with public and private subnets
- NAT gateway and Internet gateway
- Security groups
- Terraform IaC

**Observability Stack**
- CloudWatch log groups and dashboards
- Metrics and alarms
- Terraform and CDK IaC

## Use Case Templates (4)

**Strands AgentCore**
- Single-agent pattern with Strands SDK
- Supports Terraform, CDK, and CloudFormation
- Bedrock AgentCore deployment

**LangGraph AgentCore**
- Single-agent pattern with LangGraph
- Supports Terraform, CDK, and CloudFormation
- Bedrock AgentCore deployment

**Tool-Calling Agent**
- Agent with external tool integrations
- Dual framework support (Strands + LangGraph)
- Terraform deployment

**Multi-Agent Orchestration**
- Coordinator pattern with multiple specialized agents
- Framework-agnostic design
- Terraform and CDK support`,
      },
      {
        id: 'using-templates',
        title: 'Using Templates',
        content: `# Using Templates

## Creating a Project from Template

1. Navigate to **Templates** in the UI
2. Select a template
3. Choose your IaC option (Terraform, CDK, or CloudFormation)
4. Select framework (if applicable)
5. Configure parameters (project name, region, model selection)
6. Click **Bootstrap** to generate project

The platform packages the template with your parameters and provides a downloadable zip file.

## Project Structure

\`\`\`
my-project/
├── template.json          # Configuration and metadata
├── src/
│   ├── strands/          # Strands implementation
│   └── langraph/         # LangGraph implementation
├── iac/
│   ├── terraform/        # Terraform modules
│   ├── cdk/             # CDK constructs (optional)
│   └── cloudformation/  # CloudFormation (optional)
├── Dockerfile            # Container definition
├── requirements.txt      # Python dependencies
└── README.md            # Documentation
\`\`\`

## Deploying Your Project

**Option 1: Manual Deployment**
\`\`\`bash
cd my-project/iac/terraform
terraform init
terraform apply
\`\`\`

**Option 2: Via Control Plane**
Upload your customized template back to the control plane and deploy through the automated pipeline.`,
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
        fixed lg:relative inset-y-0 left-0 z-40 transform transition-transform duration-300 shadow-xl lg:shadow-none
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
