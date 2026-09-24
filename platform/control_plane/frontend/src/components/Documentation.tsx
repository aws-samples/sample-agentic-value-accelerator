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
      {
        id: 'platform-signup',
        title: 'Self-Service Signup',
        content: `# Self-Service Signup with Corporate-Email Policy

The Control Plane sign-in page has a **Create account** link. New users go through Cognito's self-service signup flow, gated by a server-side domain policy so only corporate email addresses can register.

## What enforces the policy

A Cognito **PreSignUp** Lambda (\`modules/cognito/lambda_src/pre_signup_domain_check/index.py\`) rejects any address whose domain is on a hardcoded public-mail-provider denylist. The list is server-side — it cannot be bypassed by hitting Cognito directly with curl. Blocked domains (~40 today):

Gmail (\`gmail.com\`, \`googlemail.com\`) · Yahoo (\`yahoo.com\`, \`yahoo.co.uk\`, \`yahoo.co.in\`, \`ymail.com\`, \`rocketmail.com\`) · Hotmail / Outlook / Live / MSN · AOL · iCloud / me / mac · ProtonMail / pm.me · GMX · Mail.com · Yandex · QQ / 163 / 126 / Sina · Naver / Hanmail / Daum · Zoho · FastMail · DuckDuckGo · Comcast / Verizon / ATT / SBCGlobal · Hey · Tutanota · example.com

Rejections return the message: *"Please sign up with your official company email address. Public email providers (Gmail, Yahoo, Hotmail, Outlook, iCloud, etc.) are not accepted."*

## Post-confirmation

After the user confirms their email verification code, a **PostConfirmation** Lambda (\`modules/cognito/lambda_src/post_confirmation_assign_viewer/index.py\`) places them in the \`viewer\` Cognito group. Admins promote to \`operator\` or \`admin\` manually — self-signup never grants write power.

## Advanced Security

The user pool has \`advanced_security_mode = "ENFORCED"\`. Cognito scores every sign-in attempt (device, IP, behavioural signals) and can require MFA or block on risk.

## Disabled test account

\`demo@example.com\` is a seeded account intentionally disabled at the UI layer. Attempts to sign in with it return: *"This email has been disabled. Please create an account with your work email id."* — the SPA short-circuits before calling Cognito.

## Where to look

- Frontend: \`src/components/SignIn.tsx\` — six view states (signIn, newPassword, forgotPassword, confirmReset, signUp, confirmSignUp)
- Frontend: \`src/auth/AuthContext.tsx\` — \`signUp\` / \`confirmSignUp\` / \`resendConfirmationCode\` on the auth context
- Terraform: \`modules/cognito/main.tf\` and \`modules/cognito/signup_lambdas.tf\``,
      },
      {
        id: 'platform-waf',
        title: 'WAF Bot Control',
        content: `# WAF Bot Control at the Edge

AWS WAFv2 sits in front of the Control Plane's CloudFront distribution and blocks / challenges bot traffic before it reaches the SPA.

## Rules attached

| Managed rule set | Purpose |
|---|---|
| \`AWSManagedRulesBotControlRuleSet\` (COMMON tier) | Scores every request and challenges suspected bots (scrapers, credential stuffing, headless browsers) |
| \`AWSManagedRulesCommonRuleSet\` | OWASP-style baseline — SQLi, XSS, oversized bodies |

Both rules use \`override_action = none {}\` (i.e. the rule set's own Block / Challenge / Count actions apply). To roll out safely, flip a rule's override to \`count {}\` and observe sampled requests + CloudWatch metrics before switching back to \`none {}\`.

## Scope

The Web ACL is **CLOUDFRONT-scope**, must live in us-east-1 (a CDN-scope WAF constraint), and is attached to the frontend distribution via \`web_acl_id\` on \`aws_cloudfront_distribution\`.

## Observability

Bot Control publishes CloudWatch metrics and sampled requests. The metric name is \`<name-prefix>-bot-control\` and the ACL-wide metric is \`<name-prefix>-acl\`. Look for spikes in **BLOCK** and **CAPTCHA** counts as an early bot-traffic signal.

## Not covered by WAF

WAF only sees traffic through CloudFront. The Cognito browser SDK calls \`cognito-idp.<region>.amazonaws.com\` directly, so sign-in attempts do **not** traverse the WAF. That gap is closed by Cognito Advanced Security (see Self-Service Signup).

## Where to look

- Terraform: \`modules/waf/main.tf\` — the ACL resource
- Terraform: \`modules/waf/versions.tf\` — declares the \`aws.us_east_1\` provider alias
- Terraform: \`modules/cloudfront/main.tf\` — where the ACL is attached (\`web_acl_id = var.web_acl_arn\`)`,
      },
      {
        id: 'platform-login-audit',
        title: 'Login-History Audit',
        content: `# Login-History Audit

Every successful sign-in to the Control Plane is written to a dedicated DynamoDB audit table so auditors and platform owners can answer "who signed in and when".

## What writes the row

A Cognito **PostAuthentication** Lambda (\`modules/cognito/lambda_src/post_auth_log_login/index.py\`) fires after every successful sign-in (any client — SPA, CLI, direct API). It appends one row to the audit table.

Failures are logged but never re-raised — an audit-write hiccup must not block a legitimate user from signing in.

## Table schema

Name: \`ava-cp-<id>-login-events\` · PAY_PER_REQUEST · PITR on · SSE on.

| Attribute | Type | Notes |
|---|---|---|
| \`pk\` | S | \`USER#<sub>\` — Cognito subject id |
| \`sk\` | S | \`<ISO ts>#<uuid>\` — sortable, collision-free per row |
| \`event_id\` | S | UUID |
| \`event_type\` | S | \`LOGIN_SUCCESS\` |
| \`event_time\` | S | ISO 8601 UTC with microseconds |
| \`event_date\` | S | \`YYYY-MM-DD\` — populates the GSI hash |
| \`user_pool_id\` | S | Which pool this login went through |
| \`user_email\`, \`user_sub\`, \`email_verified\` | | Pulled from \`request.userAttributes\` |
| \`region\`, \`client_id\` | S | From the trigger \`callerContext\` |
| \`source_ip\`, \`encoded_data\` | S | Advanced-Security context, when the client SDK supplies it |
| \`trigger_source\` | S | e.g. \`PostAuthentication_Authentication\` |

## Access patterns

**Per-user history** — Query pk:

\`\`\`bash
aws dynamodb query --table-name ava-cp-<id>-login-events \\
  --key-condition-expression 'pk = :u' \\
  --expression-attribute-values '{":u":{"S":"USER#<sub>"}}'
\`\`\`

**Per-day report** — Query GSI \`by_date\`:

\`\`\`bash
aws dynamodb query --table-name ava-cp-<id>-login-events \\
  --index-name by_date \\
  --key-condition-expression 'event_date = :d' \\
  --expression-attribute-values '{":d":{"S":"2026-09-22"}}'
\`\`\`

## No UI yet

There is no in-Control-Plane page for the audit table. Reports are ad-hoc via \`aws dynamodb query\` or the DynamoDB console. A Govern → Audit & Incidents cross-reference is on the roadmap.`,
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

Navigate to \`/plan/organization-design\`.

The fifth Plan tool. Once you've picked a Target Operating Model in **Operating Model**, this workspace turns that TOM into a concrete org chart — roles, squads, reporting lines, RACI, and a headcount ramp — so Plan hands Build a team, not just a strategy.

## What it produces

| Artifact | Purpose |
|---|---|
| **Org chart** | Squads under the chosen TOM (Centralized CoE / Hub-and-Spoke / Federated), with squad size, seniority mix, and reporting lines |
| **Role catalog** | Standard AVA agent-team roles — Product Manager, ML Engineer, Prompt Engineer, Safety / Guardrail Reviewer, MLOps, Data Steward, Business Analyst, plus TOM-specific overlays (e.g. Federation Liaison for the Federated TOM) |
| **RACI matrix** | Per activity (Design, Build, Secure, Operate, Govern), which role is Responsible / Accountable / Consulted / Informed |
| **Headcount ramp** | Quarter-by-quarter FTE growth from steady state today to steady state at 12 / 24 / 36 months, with hiring lag baked in |

## Workflow

1. **Read the TOM verdict** — the tool pulls the last Operating Model score and picks the recommended TOM automatically (override if you disagree).
2. **Size the ramp** — enter target agent count (fleet), average team size, and expected launches per quarter. The tool sizes squads accordingly.
3. **Fill the roles** — for each squad slot, name a person or leave as "TBH" (to-be-hired) with a target start date. Tie back to a Business Case for budget owner and quarterly cost.
4. **Export** — one-click export to a PDF / DOCX org-design pack. The RACI is also exportable as CSV for HRIS import.

## Persistence

Every workspace revision is stored per user in DynamoDB (\`ava-cp-<id>-organization-design\` — see the backend route \`api/routes/organization_design.py\`). Revisions are versioned; you can restore a prior version at any time.`,
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

The **Harness** is the managed agent loop that fronts Bedrock AgentCore. It lets you configure a system prompt, model, tools, and streaming behaviour, then test the resulting agent from an in-browser console before you deploy it anywhere.

## What it includes

| Piece | Description |
|---|---|
| **System prompt** | Freeform prompt saved per harness; version-controlled by DynamoDB record id |
| **Model picker** | Any Claude / Nova / Bedrock model your account has access to; latency and cost hints per row |
| **Tools** | Attach Registry-published tools (MCP servers, Skills, A2A endpoints) or custom REST/Lambda endpoints |
| **Guardrails** | Attach one or more Bedrock Guardrails; visible in the Guardrails tab |
| **Streaming test console** | Full SSE-streamed responses with token-by-token render, tool-call surfacing, and trace-id link into Langfuse |

## Where it fits

Harness is the *pre-flight* step for every FSI Foundry, App Factory, and reference-app agent. Once a harness passes your smoke test, its config is exported into the deployment template and the pipeline creates a matching AgentCore Runtime endpoint.

## Persistence

Every harness is a DynamoDB row (\`ava-cp-<id>-harness\`). Model + prompt + tools are captured in the record so a redeploy reproduces the same config. Delete the row and the harness vanishes from the sidebar.`,
      },
      {
        id: 'harness-test-console',
        title: 'Test Console',
        content: `# Harness Test Console

Navigate to \`/harness/<id>\` for a specific harness.

The test console streams over Server-Sent Events (SSE). Each event carries one of:

- \`token\` — a partial completion chunk
- \`tool_call\` — the agent invoked a tool; the panel expands and shows arguments + result
- \`trace_id\` — sent once per turn; click to open the run in the embedded Langfuse observability tab
- \`error\` — surfaced inline (not silently swallowed); if the agent errored, evaluation runs will now surface the failure reason instead of a default 0/0 verdict

## Sessions

Sessions are ephemeral by default (memory cleared per test). Toggle **Persist session** to keep conversation memory across turns — useful for multi-turn tool-use flows. Persistent sessions write into your AgentCore Memory store (see the Memory page).

## Promote to Deployment

Once the harness passes your bar, click **Promote** to open the deployment picker. This copies the harness config into the FSI Foundry / App Factory / Reference Implementation deploy form so you don't retype anything.`,
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

The **Memory** section manages AgentCore Memory stores — long-term memory that survives a single turn or session. Three memory kinds are surfaced:

| Kind | Description | Typical use |
|---|---|---|
| **Semantic** | Vector-backed store; retrieve by embedding similarity | Personalisation, past-intent recall |
| **Episodic** | Time-ordered event log per user | "What did the user last ask about their portfolio?" |
| **Summary** | Rolling LLM-generated conversation summary; capped at a token budget | Long-running assistants that need to remember context beyond the model window |

## How memory stores are used

Each harness (or deployed agent) can attach one or more memory stores by ARN. At runtime the AgentCore Runtime injects retrieved memory into the agent's prompt before invocation.

The market-surveillance and KYC – Controlled Quality Output reference apps both attach a semantic memory. The R07 Govern Compliance Agent (Foundry) attaches an episodic memory.

## Provisioning

Registering a memory in the UI creates an AgentCore Memory resource and one or more strategies. Note: memory updates are asynchronous — the store transitions \`CREATING → UPDATING → ACTIVE\` and a second update while a first is in-flight returns \`ValidationException: Memory is in transitional state UPDATING\`. The UI polls and waits.`,
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

AVA registers every discoverable agent, tool, and skill against the **AWS Agent Registry** under the AVA namespace. Five typed record kinds live under Build → Registry:

| Sub-page | Record kind | AWS Registry \`recordType\` |
|---|---|---|
| Agents | Agent | \`AGENT\` (Kind = \`agent\`) |
| MCP Servers | MCP endpoint | \`MCP\` |
| A2A Servers | Agent-to-agent endpoint | \`AGENT\` (Kind = \`a2a\`) |
| Skills | Reusable skill | \`SKILL\` |
| Custom Resources | Anything not fitting the above | \`CUSTOM\` |

## Lifecycle

Every record follows the same state machine, driven by \`agent_registry_client.py\`:

\`CREATING → DRAFT → PENDING_APPROVAL → APPROVED\`

- **CREATING → DRAFT**: async, polled by the backend.
- **DRAFT → PENDING_APPROVAL**: submit-for-approval when the record fills its mandatory fields.
- **PENDING_APPROVAL → APPROVED**: the linked Approval Policy fires — either auto-approves or lands in Operate → Approval Queue.

## Auto-publish on deploy

Every successful CodeBuild deployment triggers the *deployment success hook* Lambda (in \`modules/deployment_success_hook\`), which publishes the deployed application as an \`AGENT\` record. Idempotent — dedupes on the \`DeploymentId\` tag.

## Tags

Registry tags are read via \`ListTagsForResource\` (not returned by \`GetRegistryRecord\`), so the UI issues both calls when it renders a detail page.`,
      },
      {
        id: 'registry-agents',
        title: 'Agents',
        content: `# Registry → Agents

Navigate to \`/registry/agents\`.

Inventory of every Agent-kind record. Each row shows: name, owner, scope, current state, linked deployment (if any), and last approval decision. Click a row to open its detail panel.

Filters: kind (agent / a2a), status (DRAFT / PENDING / APPROVED), owner, tag.

**Register manually** → opens a form that writes a new AGENT record. The record starts in DRAFT and cannot be attached to a deployment until it clears the approval policy.`,
      },
      {
        id: 'registry-mcp',
        title: 'MCP Servers',
        content: `# Registry → MCP Servers

Navigate to \`/registry/mcp\`.

Model Context Protocol server endpoints. Each MCP server is fronted by the AgentCore Gateway; the gateway enforces the Cedar policy attached to it (see Secure → Policy).

Registering an MCP server writes an \`MCP\` record and, on approval, wires the server into the AgentCore Gateway for every harness/agent that references it by ARN.

Common sources:
- Capabilities → Knowledge auto-registers one MCP server per Knowledge source
- FSI Foundry use cases can bring their own MCP servers
- External MCP servers (via URL) can be registered manually`,
      },
      {
        id: 'registry-a2a',
        title: 'A2A Servers',
        content: `# Registry → A2A Servers

Navigate to \`/registry/a2a\`.

Agent-to-agent endpoints — other agents that this agent can call directly, subject to Trust Policies (see Govern → A2A Governance). A2A records use \`recordType=AGENT\` with \`Kind=a2a\` under the hood, but are surfaced separately in the UI to keep the agent inventory clean.`,
      },
      {
        id: 'registry-skills',
        title: 'Skills',
        content: `# Registry → Skills

Navigate to \`/registry/skills\`.

Reusable atomic behaviors an agent can call (e.g. "score a transaction", "draft a SAR"). Skills are less abstract than tools — they wrap a specific business action with typed contracts.

Each skill row shows: input schema, output schema, owner, deployment coverage, last invocation count.`,
      },
      {
        id: 'registry-custom',
        title: 'Custom Resources',
        content: `# Registry → Custom Resources

Navigate to \`/registry/customresources\`.

Escape hatch for anything that doesn't fit the four typed kinds — datasets, evaluators, prompt templates, feature flags. Uses \`recordType=CUSTOM\` and a free-form JSON body.`,
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

The **Catalog** is a unified inventory across every Build subsection — Foundry use cases, Reference Implementations, App Templates, App Factory apps, AaaS Frontier Agents, Harness configurations, Memory stores, and all five Registry record kinds — with a single filterable table showing:

- Resource name and kind
- Owner / team
- Registry status (Active · Pending · Deprecated)
- Deployment status (Deployed · Not Deployed · Failed)
- Last-modified timestamp
- Link to the resource's home page

## Why one screen

Auditors and platform owners need "one screen that shows what's live". The Catalog is that screen — it doesn't duplicate the child pages, it summarises across them so you can spot orphaned resources (Registry APPROVED but no deployment), deprecated resources still attached to a live deployment, and Deploy-Failed rows that need attention.

## Powered by

The Catalog reads live data from the same DynamoDB tables the child pages use (\`-deployments\`, \`-mcp-servers\`, \`-a2a-agents\`, \`-agents\` via the Governance Aggregator described in Architecture). It's a read-only view — actions like *Deprecate* or *Redeploy* deep-link back to the owning page.`,
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

Navigate to \`/secure/llm-gateway\` (also reachable from Govern → FinOps for spend data).

The **LLM Gateway** is a LiteLLM proxy on ECS Fargate that fronts every Bedrock (and vendor) model call. It gives you one chokepoint for auth, budgets, guardrails, tracing, and cost accounting.

## What lives behind the gateway

| Layer | Purpose |
|---|---|
| **Virtual keys** | One key per agent / team; per-key budgets, RPM/TPM rate limits, model allowlist |
| **Guardrails (during_call)** | Bedrock Guardrails attached as a LiteLLM \`during_call\` hook — content filters, PII, denied topics run inline |
| **Langfuse trace emission** | Every call is emitted as a Langfuse trace with request/response/latency/tokens |
| **CloudWatch audit** | Full audit trail per virtual key |
| **Bedrock Mantle key** | Reads Anthropic Mantle keys from Secrets Manager for GPT-5.x fallback models |

## Tabs on \`/secure/llm-gateway\`

1. **Overview** — health, master-key check, healthy_count / configured_count.
2. **Config** — the live \`config.yaml\` synced from S3; edit-in-place with a diff view before applying.
3. **Models** — every configured model with owner (Anthropic / Amazon / Mantle) and status.
4. **Virtual Keys** — list / create / revoke; each key shows budget, spend, RPM/TPM.
5. **Spend** — spend by key, by model, by day; feeds Govern → FinOps.
6. **Audit** — the LiteLLM audit log with filter-by-key.
7. **Playground** — issue a chat completion against the gateway with any virtual key.

## Local dev

Docker Compose ships a gateway container on \`http://localhost:4000\` using master key \`sk-local-dev-key\`. See Getting Started → Local Development for the AWS-credentials-export dance the container needs.

## Endpoint

Every agent points at one \`LITELLM_BASE_URL\` — resolved at deploy time and injected into the agent's task-role environment. There is no direct Bedrock SDK path from an AVA-deployed agent.`,
      },
      {
        id: 'secure-identity',
        title: 'Identity',
        content: `# Identity

Navigate to \`/secure/identity\`.

The **Identity** page manages federation to external identity providers. AVA's user pool remains the anchor (Cognito), but sign-in can be delegated to Microsoft Entra ID, Okta, Auth0, or any generic OIDC provider — so enterprise SSO drops in without a Cognito rebuild.

## Supported providers

| Provider | Auth flow | Status |
|---|---|---|
| Microsoft Entra ID | Auth Code + PKCE | Available |
| Okta | Auth Code + PKCE | Available |
| Auth0 | Auth Code + PKCE | Available |
| Generic OIDC | Auth Code + PKCE (via discovery URL) | Available |

## What the page does

1. **Register a provider** — enter name, discovery URL (or explicit issuer/authorize/token/userinfo URLs), client id, client secret. The form runs a discovery probe and reports back which endpoints resolved.
2. **Claim mapping** — map the provider's group / role claim onto AVA roles (\`admin\`, \`operator\`, \`viewer\`). Group prefixes and regex mapping supported.
3. **Test sign-in** — a "Test" button drives a canned OIDC handshake and returns the resolved claims + which AVA role would be assigned.
4. **Approval routing** — registration goes through the Approval Queue by default (Approval Policy: \`resource_kind=identity_provider, action=register, role=OPERATOR\`).

## Self-service signup (Cognito, not federated)

Separately from federation, AVA's own Cognito user pool now supports **self-service signup** with a corporate-email PreSignUp Lambda. See Getting Started → Self-Service Signup for the rules.`,
      },
      {
        id: 'secure-approval-policies',
        title: 'Approval Policies',
        content: `# Approval Policies

Navigate to \`/secure/approvals\` (Approval Policies) — the runtime queue lives at \`/operate/approvals\` (see Operate → Approval Queue).

Approval Policies declare the human-in-the-loop rules that guard sensitive actions across the platform.

## Policy shape

Each policy is a rule with five slots:

| Slot | Meaning | Example |
|---|---|---|
| \`resource_kind\` | What kind of resource the action targets | \`mcp\`, \`a2a\`, \`skill\`, \`agent\`, \`custom\`, \`identity_provider\`, \`application\` |
| \`action\` | What the actor is trying to do | \`register\`, \`deploy\`, \`delete\`, \`promote\` |
| \`required_role\` | Who can sign off | \`ADMIN\` / \`OPERATOR\` |
| \`quorum\` | How many approvals are required | 1 or 2 |
| \`sla_hours\` | Time budget before a request is flagged as stale | Typically 24 or 72 |

## Seeded defaults

Eight \`AVA Default\` policies are seeded on backend boot by \`approval_policy_bootstrap.py\`:

- MCP / A2A / Skills / Agents / Custom / Identity registration → require OPERATOR sign-off
- Application delete → require ADMIN sign-off
- Application deploy → auto-approve (logged for audit)

## Enforcement path

The Approval Policy Engine (\`approval_policy_engine.py\`) is called from every registration/deployment route (\`mcp.py\`, \`a2a.py\`, \`skills.py\`, \`agents.py\`, \`custom_resources.py\`, \`identity_providers.py\`, \`deployments.py\`). The engine returns a \`PolicyVerdict\` (\`auto_approve\` / \`require_approval\` / \`deny\`); \`require_approval\` writes an approval request that shows up in Operate → Approval Queue.

## Priority resolution

When multiple policies match, resolution is: mode strictness (deny > require > auto) → pattern specificity → role strictness (ADMIN > OPERATOR). The matched policy is recorded on the approval request for audit.`,
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

## AI Governance Assessment

Navigate to \`/govern/assessment\` for the full assessment tool, or start from the banner on the Govern landing page.

### Overview

The AI Governance Assessment is a comprehensive maturity evaluation tool that helps organizations:
- **Assess** their current AI governance posture across 14 domains
- **Identify** gaps against 11 regulatory frameworks
- **Prioritize** remediation based on risk and effort
- **Track** progress toward compliance goals

### Assessment Wizard

The assessment follows a multi-step wizard flow:

| Step | Content |
|------|---------|
| 1. Organization Info | Company name, industry, size, operating regions |
| 2-15. Domain Questions | 8-10 questions per domain, each rated 1-5 maturity |
| 16. Results | Radar chart, scores, gaps, recommendations |

### 14 Governance Domains

| Domain | Description | AVA Module |
|--------|-------------|------------|
| Inventory & Registry | AI asset discovery and cataloging | Agent Registry |
| Model Governance | Model lifecycle, validation, monitoring | Model Management |
| Risk Management | Risk identification, assessment, mitigation | Risk Management |
| Data Governance | Data quality, lineage, privacy | Data Governance |
| Fairness & Bias | Bias detection, fairness metrics | Compliance Center |
| Transparency & Explainability | Model interpretability, decision audit | Audit & Incidents |
| Security & Safety | AI-specific security controls, safety testing | AI Safety |
| Compliance & Audit | Regulatory mapping, evidence collection | Compliance Center |
| FinOps & Cost | Cost allocation, budget controls, optimization | Cost & FinOps |
| Human Oversight | Approval workflows, escalation paths | Command Center |
| Agentic Autonomy | Autonomy levels, guardrails, boundaries | Agentic Fleet |
| Multi-Agent Governance | Agent-to-agent coordination, topology | Agent Topology |
| Incident Management | AI incident response, root cause analysis | AI Safety |
| Shadow AI | Unsanctioned AI detection, remediation | Shadow AI |

### Maturity Levels

Each question is rated on a 5-point maturity scale:

| Level | Name | Description |
|-------|------|-------------|
| 1 | Initial | Ad-hoc, undocumented processes |
| 2 | Developing | Basic processes defined but inconsistent |
| 3 | Defined | Standardized processes across organization |
| 4 | Managed | Measured, controlled, continuously improved |
| 5 | Optimizing | Industry-leading, automated, adaptive |

### Regulatory Framework Mapping

The assessment maps to 11 regulatory frameworks:

| Framework | Region | Industry | Mandatory |
|-----------|--------|----------|-----------|
| NIST AI RMF | US/Global | All | No |
| EU AI Act | EU/EEA | All | Yes (2026) |
| SR 26-2 | US | Banking/FSI | Yes |
| SR 11-7 | US | Banking/FSI | Yes |
| ISO 42001 | Global | All | No |
| CRI FS AI RMF | Global | FSI | No |
| OSFI E-23 | Canada | FSI | Yes |
| NAIC AI Bulletin | US | Insurance | Yes |
| MAS FEAT | Singapore | FSI | No |
| SG AI Framework | Singapore | All | No |
| APRA CPG 235 | Australia | FSI | Yes |

### Stakeholder Views

Filter assessment questions and results by stakeholder role:

| Role | Focus Areas |
|------|-------------|
| Board/Executives | Strategic risk, compliance status, cost |
| Risk Management | Risk assessment, controls, monitoring |
| Technology/Engineering | Technical implementation, security, data |
| Legal/Compliance | Regulatory requirements, audit evidence |
| Internal Audit | Control testing, evidence, gaps |

### Auto-Populate Feature

The assessment can automatically scan your AVA deployment to pre-fill answers:
- Checks each AVA module's API endpoint (5-second timeout per module)
- Detects what's deployed vs. configured vs. has data
- Pre-selects maturity level based on observed state
- Shows confidence indicators for auto-populated answers

### Results Dashboard

After completing the assessment:

| View | Content |
|------|---------|
| **Summary** | Overall maturity score, framework compliance percentages |
| **Radar Chart** | Visual comparison of domain maturity levels |
| **Gap Analysis** | Table of identified gaps with severity, domain, framework impact |
| **Recommendations** | Prioritized remediation actions by effort and impact |

### Gap Severity Levels

| Severity | Criteria |
|----------|----------|
| Critical | Maturity 1-2 in domain required by mandatory framework |
| High | Maturity 1-2 in core domain, or gap blocks multiple frameworks |
| Medium | Maturity 3 in domain with regulatory requirement |
| Low | Maturity 3-4 in optional domain |

### Integration with Govern Module

Assessment results integrate throughout the Govern module:
- **Landing Page Banner**: Shows gap counts and prompts to complete assessment
- **Module Headers**: Display relevant gaps for each module
- **Compliance Center**: Uses assessment data for framework coverage calculation
- **Reports**: Include assessment scores in board packages

## Govern Core: See It, Govern It, Show It

Nine foundational modules organized into three pillars. The Compliance Center tracks **14 frameworks and 281 controls** in total; what share of each framework the module covers is estimated below, not measured.

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
| **Data Sensitivity** | Not estimated | PII / PHI / PCI controls required before production deployment |
| **AWS RAI Lens** | Not estimated | AWS Well-Architected Responsible AI Lens |
| **Colorado AI Act** | Not estimated | Consumer-notice regime for consequential automated decisions (SB 26-189) |
| **NIST GenAI Profile** | Not estimated | NIST AI 600-1 Generative AI Profile |

**The Coverage column is an estimate of how much of each framework the module maps — it is not a measurement, and it is not a pass rate.** For what has actually been assessed against these controls, see **Compliance Center → How much of that is actually assessed**: 24 of the 281 controls are assessed today, all of them by automated existence probes.

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
| Operations | \`/govern/operations\` | Add-on |
| Reports | \`/govern/reports\` | Add-on |

## Live Data Integration

Every Govern surface labels its own numbers, and there are **three** possible states, not two:

| State | Badge | Meaning |
|-------|-------|---------|
| Measured | \`Live\` | Read from the AWS account this platform is connected to. |
| Illustrative | \`Demo\` / \`Mock\` | Seeded example data, shown so a screen is legible before its underlying signal is connected. |
| Unmeasured | \`—\` or \`Not Measured\` | The platform has no source for this value in your account. No value is shown, and none is invented. |

A number is never badged \`Live\` merely because it was calculated from live inputs. Where the platform cannot measure a value, it shows the unmeasured state rather than a plausible-looking substitute — a fabricated \`0\` or \`$0.00\` would read as a **good** result when the truth is "unknown".

See **How to Read the Numbers** for the full data-honesty contract, what changed on screen in the current release, and what each unmeasured metric would need in order to become live.

## Recent Hardening & Fixes (this wave)

- **cost/by-model 422 fix** — \`useLiveMetrics\` and \`useLiveKPIs\` called \`governCostApi.byModel(30)\`, but the endpoint caps \`months\` at 12, returning a 422 that surfaced on the Command Center. Both callers now request \`byModel(12)\`.
- **Canonical Bedrock model names in by-model cost** — the Cost Explorer USAGE_TYPE parser emitted two naming styles for one family (\`Claude4.5Opus\` alongside \`Claude Opus 4.8\`), splitting a family across rows and letting metered-unit suffixes such as \`-1h\` / \`-token-count\` surface as a model name. \`GovernCostService._model_from_usage_type\` now strips the metered unit whole and normalizes BOTH formats to Bedrock's catalog display name (\`<Family> <Tier> <Version>\`, e.g. \`Claude Opus 4.5\`, \`Nova Pro\`). Because that is the same string the Bedrock catalog uses, Model Inventory's "Cost (3mo)" column now joins CloudWatch model ids to real spend instead of showing \`—\` (verified live: 4 of 10 in-use models joined before, 9 of 10 after — the tenth has genuinely zero spend). Distinct SKUs stay distinct rows and the cache / token-direction split is unchanged, since \`token-costs\` classifies it from the raw usage type.
- **Account-ID masking hardening** — the shared \`mask_account_id\` helper (\`core/security_utils.py\`) used a \`\\b\` word boundary that missed 12-digit account IDs adjacent to \`_\` (e.g. inside resource names / ARNs). It now uses digit lookarounds (\`(?<!\\d)(\\d{12})(?!\\d)\`), and masking was extended to the IAM vendor-access ARNs and \`resource_scope\` and to the Bedrock inference-profile / prompt-router ARNs. All Govern live endpoints were verified leak-clean.`,
      },
      {
        id: 'govern-data-honesty',
        title: 'How to Read the Numbers',
        content: `# How to Read the Numbers

Every figure in Govern carries a label describing where it came from. Reading that label matters as much as reading the value, because Govern will deliberately show you **no value at all** when it cannot honestly measure one.

## The three states

| What you see | What it means | What you should do with it |
|--------------|---------------|----------------------------|
| \`Live\` | Measured from the AWS account this platform is connected to. | Trust it, cite it, put it in front of an auditor. |
| \`Demo\` / \`Mock\` | Illustrative seeded data, shown so the screen is legible before its underlying signal is connected. | Use it to understand the surface. Never quote it as a result. |
| \`—\` or \`Not Measured\` | The platform genuinely cannot measure this in your account yet. | Treat it as **unknown**, not as zero and not as a bug. |

## Why a blank tile is a feature, not a failure

If a metric has no source, there are only two honest options: show nothing, or invent something. Older versions of several tiles invented something — usually \`0\`, \`0%\`, or \`$0.00\`.

That is worse than showing nothing, because for most governance metrics **zero is the good answer**. A \`0\` in an incident tile reads as "no incidents". A \`$0.00\` in a cost tile reads as "this costs us nothing". A green "Excellent" on a detection-time tile reads as "we detect problems instantly". If the real state is "we have never measured this", every one of those readings is wrong in the flattering direction, which is the most dangerous direction for a governance number to be wrong in.

So the platform now separates the two cases:

- **A measured zero still displays as \`0\`.** If the platform looked, and the answer really was none, you see \`0\` under a \`Live\` badge.
- **An unmeasurable value displays as \`—\` or "Not Measured".** The platform looked and found no source at all.

Most unmeasured values carry a short note or a hover tooltip naming the signal that is missing, so you can tell "unknown" from "nothing to report" without leaving the screen.

> A tile that shows \`—\` is telling you something true about your account. A tile that showed \`0\` was telling you something false about your AI estate.

## "Connected" is measured, not declared

The same rule applies to the **AWS Data Sources** panel on the Govern landing page, and it is worth stating separately because that panel makes a claim about *your* account rather than about a metric.

The panel used to read **"47/50 connected"** in green. That number was hardcoded. It was identical for every deployment, it appeared before any AWS call had been made, and it would have read 47/50 in an account with no permissions at all. It is now the result of calling all 50 services: each row runs one read-only AWS API call, and the header counts only the calls that came back.

**A green count now means somebody checked.** If the header says 43 of 49, then 43 services answered, and the six that did not each say why. The panel only turns green when *everything* it checked answered and nothing was left unchecked — so on most real accounts it will be some other colour, which is the honest outcome.

| Row status | What it means |
|------------|---------------|
| **Connected** | The call succeeded and returned data. |
| **Connected (empty)** | The call succeeded and returned nothing. **This still counts as connected** — the integration works, your estate simply has none of that resource yet. An empty Bedrock prompt library is not a broken Bedrock connection. |
| **Access denied** | The service is reachable but this platform's role lacks the permission. A permissions fix, not an outage. |
| **Not enabled** | The service works but is switched off or unconfigured in your account. |
| **Error** | The call failed for some other reason, with the reason shown. |
| **Not probed** | No check was run, because the platform is missing a setting it would need. Shown explicitly rather than assumed to be fine. |

Two consequences worth knowing:

- **"Connected (empty)" and "Not enabled" look similar and are not.** The first means the pipe works and your estate is clean; the second means the pipe is closed. Collapsing them into one green/red flag is exactly what the old panel did, and it is why a clean estate could read as a broken integration and a disabled service could read as healthy.
- **A gap in this panel is usually actionable — and one of them turned out to be ours.** In the reference account the honest version surfaced a Security Lake permission the role was missing, a service not enabled in the region (Detective), one source it could not probe at all because its table-name setting is blank (Service Approvals), and four control-plane tables reported as missing — none of which the green 47/50 would ever have shown you. The last of those was a platform defect, not a customer gap: **the tables existed all along, and were being looked for in the wrong region.** The panel probed them in the governed-fleet region while they live in the control-plane region, and DynamoDB answers a table that is not there with \`ResourceNotFoundException\` rather than an error about the region. Control-plane tables now resolve through the control-plane table region (see "Which regions a number covers"), and three of the four answer as reachable-and-empty; the fourth is still \`Not probed\` because its table name is unset. The current measured header reads **47/49 verified · 1 not probed**: of 50 sources, 37 connected, 10 connected-empty, 1 access-denied, 1 not-enabled, 1 not-probed, and no errors.

Re-checking is free for all but one source (AWS Cost Explorer charges per call), results are cached, and the panel shows when it last checked.

## Which regions a number covers

A count from one region and a count merged from five look identical on screen. That makes region coverage a provenance question, not a deployment detail, so Govern states it rather than leaving you to assume.

Three different things get called "multi-region", and only one of them is answered by looking in more than one place:

| Kind of data | Example | How many regions it reads | Where the region comes from |
|---|---|---|---|
| **Your AI estate** | Agents, guardrails, models, knowledge bases, security findings, their CloudWatch metrics | Every region you have brought under governance, merged | The governed-region set, falling back to \`GOVERN_AWS_REGION\`. Read-only, so merging is safe. |
| **Account-wide services** | Cost Explorer, Budgets, Organizations, IAM | One endpoint that already answers for the whole account | A pinned endpoint. Most pin themselves; AWS Health and Support do **not**, and a wrong region there fails outright, so they are pinned explicitly. |
| **This platform's own records** | Guardrail templates, audit entries, approvals, incidents, attestations | One region, because these are written as well as read | \`CONTROL_PLANE_TABLE_REGION\`, or a per-table override for a single table. Defaults to the platform's own region. |

That last row is the one worth understanding. Records this platform *writes* live in exactly one region on purpose. Reading them from several regions at once would mean an edit made in one region shows as stale in another, with duplicate rows on screen and no rule for which one wins. If those records ever need to be genuinely multi-region, that is a database-level change (DynamoDB Global Tables), not something the screen should paper over.

**Those are three separate settings, and they used to be one.** A single region value was serving both "where this platform keeps its own tables" and "where your fleet is", which is fine only while those are the same region. In the reference account they are not: the governed fleet and its guardrails are in one region and the control-plane tables are in another. Splitting them is the fix for a whole class of quietly-wrong numbers — see the fleet-size and Incidents rows in "What changed on screen" below.

**A misconfigured region is reported, never silently emptied.** In one deployment the guardrail template store had been created in a different region from the one the platform was reading. The old behaviour was an empty list — a page that read "0 guardrail templates" for an account that had **11**. It now names both the table and the region it searched, and tells the operator which setting to correct. An empty list must mean "you have none", not "we looked in the wrong place".

**Not every panel aggregates, and Govern will tell you which do.** Of **55 Govern data surfaces**, measured in this build:

| Coverage | Surfaces | What a number on that panel covers |
|---|---|---|
| Merged across governed regions | **10** | Every governed region that answered — and the panel says so when one did not |
| Single region | **31** | Your primary governed region only. Matching resources elsewhere are **not** in the count. |
| Account-wide endpoint | **3** | The whole account already; there is nothing to merge |
| This platform's own records | **11** | One home region, or no region at all |

The ten that merge are Agentic Fleet, Model Management, Guardrails, Security, Risk Posture, Evaluations, Knowledge Bases, AgentCore, AI Safety, and region discovery itself.

Two consequences worth knowing:

- **When a governed region cannot be reached, a merged total is a floor, not a count.** The response names the regions it reached and the ones it did not, and the surface reports the gap instead of quietly returning a smaller number.
- **A region can answer and still contribute nothing.** If a service is not enabled in a region, that region replies successfully with no data. It is not unreachable, but it did not add anything — so an estate spread over three regions where two have the service switched off would otherwise read as complete. Govern counts those separately.

**What that looks like on screen.** Merged numbers carry a small coverage badge, and the two gaps are told apart because they need different fixes:

| Badge | Meaning | What to do |
|---|---|---|
| *nothing* | One region, and it answered. Or the panel reads a single region by design. | Nothing. A badge on every card would train you to ignore the one that matters. |
| \`3 regions\` (grey) | Every governed region answered with data. | Nothing — this is the number you asked for. |
| \`1/3 live\` (grey) | All regions answered, but two had nothing to report. | Check whether the service is enabled in those regions, or whether the read is granted there. |
| \`2/3 regions\` (amber) | A region did not answer at all. **The total is a floor, not a count.** | Treat the number as a minimum until the region is reachable. Hover for which one. |

**A count can also be a floor for a reason that has nothing to do with regions.** Security Hub findings are read up to a scan limit. When an account has more findings than the limit, Govern shows what it counted, marks it \`Floor\`, and prefixes the total with \`≥\` — a scan of 200 in an account with more is honestly "at least 200", not "200". This matters most on the severity tiles: **"0 Critical" out of a truncated scan is not "no critical findings"**, so the same marker appears on the Command Center card.

**One region can no longer stall the platform.** Merged reads are capped in wall-clock time; a region that does not answer inside the cap is reported unreachable and the rest of the answer is returned. Before that cap, bringing a region under governance that was not actually enabled on the account made every merged read hang, because AWS does not fail fast for a disabled region — it retried until it gave up. Discovery only ever offers regions that are enabled, so this needed a deliberate misconfiguration to reach; it is now bounded regardless.

**Bringing a new region under governance does not make every panel cover it.** The confirmation message after you pull a region in states how many surfaces actually aggregate and names them, rather than implying the whole module widened. That message is generated from the platform's own registry, so it cannot drift out of date as more surfaces are fanned out.

## What changed on screen in this release

A deep audit of the Govern module found metrics that were being presented as measurements when they were actually placeholders. Those have been corrected. Some numbers went **down**, and some values **disappeared** — both are intended.

| Where | What you see now | Why it changed |
|-------|------------------|----------------|
| **Agent Registry** — headline counts | A lower agent total than before | Headline counts now include only agents actually discovered in your AWS account. Demo agents still appear in the table, each marked \`Demo\`, but no longer inflate the totals. |
| **Agent Registry** — governance status | Compliant / non-compliant derived from resource tags, or \`Unknown\` | AWS agents were previously all pinned to "review needed" regardless of their real state. |
| **Agent Registry** — per-agent cost | Unmeasured | AWS cannot attribute spend to an individual agent without an activated cost allocation tag. Provider-level AWS cost **is** now real spend. |
| **Operations** — mean time to detect | "Not Measured" instead of a green "Excellent" | Nothing in the platform records when an incident was **detected**, only when it was acknowledged and resolved. |
| **Cost & FinOps** — trend chart | "Monthly AWS Spend Trend" instead of "Value Creation Trend" | The savings and ROI series had no source and were removed. The chart now plots real monthly AWS spend. |
| **Cost & FinOps** — AgentCore compute cost | A real dollar figure instead of a permanent \`$0.00\` | Billed compute spend is now allocated across runtimes by their measured CPU and memory hours. |
| **Developer AI Usage** and **Shadow AI** | Token counts and per-model costs measured from invocation records | These were previously flat per-event estimates applied uniformly. |
| **Data Governance** — readiness score | One score, disclosed as covering 6 of 7 dimensions | Two different scales previously disagreed with each other on the same screen. |
| **Agentic Fleet** — maturity pillars | Lower pillar scores that now move over time | The previous formulas saturated at 90% or 100% for any non-trivial fleet. |
| **Policy-Reality Drift** | Three drift categories instead of four | The "Approval Bypass" category never detected anything, because the platform has no approval signal to compare behaviour against. |
| **Risk Management** — vendor concentration | Concentration calculated per model capability | A vendor was previously counted against every capability at once, overstating exposure. |
| **Command Center** — risk posture panel | A populated panel | The panel was silently blank because of a defect; it now fills from AWS Security Hub. |
| **Govern landing** — AWS Data Sources panel | A measured count in neutral grey rather than green — **47/49 verified · 1 not probed** in the reference account | The old count was hardcoded at 47/50 and identical in every deployment. Each of the 50 rows now runs a real read-only AWS call, and the denominator counts only the rows that have a probe at all. See "Connected is measured, not declared" above. |
| **Guardrails** — template list and metrics | Your real templates instead of an empty list | The template store had been created in a different region from the one being read, and the failure surfaced as \`0\` rather than as an error. See "Which regions a number covers" above. |
| **Agentic Fleet** — guardrail invocation and block tiles | The same numbers over a **30-day** window, with the window named in the tooltip | These read a fixed 24-hour window that was not stated on screen. The window is now part of the label, so it cannot silently change underneath the number. The 24-hour tiles elsewhere still cover 24 hours. |
| **Data Governance** — records anonymised | A real count instead of a permanent \`0\` | AWS reports masking and redaction account-wide, not per guardrail. The tile summed a per-guardrail figure that no AWS metric populates, so it was structurally zero. It now reads the real sensitive-data intervention count and is labelled account-wide. |
| **Risk** and **Command Center** — Security Hub findings | \`≥200 active findings\` with a \`Floor\` marker, and the marker on the severity tiles too | The scan limit was reached, so the counts were a minimum being presented as a total. The account has more findings than were examined; "0 Critical" was a floor, not a finding of zero. |
| **Agentic Fleet** — AWS agent count | A coverage badge when the merge did not cover every governed region | A merged count of 36 from one region out of three read exactly like a complete fleet of 36. |
| **Agentic Fleet** — region coverage note | The note no longer contradicts the data | Fleet aggregation reported \`no live data from us-east-1\` while returning 36 real agents from that region. The liveness check could not read the fleet service's result shape and marked every region as having contributed nothing. |
| **Cost & FinOps** — Cost by Region | Regions outside the governed set are marked, with the total called out underneath, and the panel says "top 6 of N regions" | Cost Explorer reports spend for **every** region your account used, but every other Govern dashboard only covers the regions you brought under governance. That means this panel can see AI spend nothing else in the module is watching — measured here as 6% of total spend across six regions — and it previously drew those bars as if they were covered. The bars were also a top-6 view presented as the whole account. |
| **Models** — Availability & Routing | A **By Region** breakdown of how many models each region lists, and a count of models not listed in every region | The "Models" tile is the union of every region's catalog, so it is larger than what any single region can actually invoke. A model missing from a region fails at invoke time rather than at deploy time, and nothing on screen said which models those were. |
| **Models** — inference profiles table | The old \`Regions\` column is now **Routes To**, with a new **Listed In** column beside it | One column was doing two jobs' worth of meaning. Where a profile *routes traffic to* and which governed regions *returned the profile at all* are independent: a profile that routes to five regions can still have been listed from one. Rows returned by fewer regions than their peers are marked. |
| **Risk** — page header badge | The header no longer claims "live" and "seeded" at the same time; it badges only the two tabs its data actually covers | The header rendered a Live badge derived from use-case risk scores next to an unconditional Mock badge, and both applied to all eleven tabs. The risk scores back the Dashboard and Register only, so the live claim was wrong on nine tabs and the seeded claim was wrong on two. Each tab now reports its own source, which is the only place the source is known. |
| **Operations** — Availability tab | The "Fleet Availability" tile is now **Fleet Health**, reports \`—\` when nothing was measured, and no longer carries a measurement window | Three claims on one tile were wrong. The number is a snapshot share of agents reporting healthy, not uptime — nothing in the platform samples health over time, so the "30-day measurement window" caption described a window the figure never covered. And when every agent's health resolves to UNKNOWN, which is the current state, the underlying ratio is a hard \`0.0\`: the tile rendered a green **0.00% availability** for a fleet whose health was never actually determined. The backend now sends \`null\` for unmeasured, the same treatment MTTD and SLA compliance already had. |
| **Operations** — SLA detail | A seeded SLA definition no longer serves its detail view under a Live badge | \`GET /operations/sla/{id}\` reported \`live=true\` unconditionally, including when the SLA came from the in-memory seed rather than DynamoDB — which is every SLA today, since no SLA targets are stored. Detail now reads provenance from the same loader the list does, so the two can no longer disagree about where an SLA came from. |
| **Operations** — on-call card | A live rotation with nobody on call now reads **No one on call** in red, instead of showing a staffed shift | The card gated on live data correctly and then, inside that branch, filled each empty field from the demo roster. The on-call source reports "live" with no one assigned in two real situations — the pager service saying the rotation is empty, and stored shifts existing but none covering right now — and both rendered a named primary, a backup, and a shift end time next to the pulsing green live dot. Someone reading it would page a person who is not on the rotation, and the actual gap was invisible. |
| **Operations** — capacity runway | Projected Runway reads \`—\` when no growth history exists, quotas with no published limit read **NO LIMIT**, and Avg Headroom no longer shows \`NaN%\` | Live AWS Service Quotas report a current value and a limit but no usage history, and the growth rate was recorded as 0 rather than as unknown. Because a zero growth rate makes the runway calculation unbounded, every live quota dropped out of it and the tile fell back to a hardcoded **90 days** — shown for every account regardless of usage, and unable to ever turn amber or red. Fixing that exposed two more: AWS returns \`0 / 0\` for quotas whose limit is not published, which produced a literal **\`NaN%\`** headroom figure under the live badge, and was also read as "already at limit", pulling the whole-account runway to **0 days in red**. |
| **Operations** — agent risk tier | Discovered agents show **Not assessed** instead of a guessed tier | An agent's governance risk tier was inferred by looking for words in its **name** — "trading" meant critical, "customer" meant high — and anything that matched nothing was labelled **Low**, the most permissive tier in the scheme. A production agent nobody had reviewed appeared as assessed-low-risk next to a live-data badge. The name matching is gone; an unassessed tier is now shown in dimmer grey than Low, because an absent assessment must not read as a passing one. |
| **Metrics** — audit MTTR | Incident Resolution (MTTR) reads \`—\` with "audit events carry no resolution time" | The board-tier MTTR figure was the constant **25 minutes** whenever any incident had resolved, and the **target value** when none had — the second case making an unmeasured metric read as exactly on target. Both were displayed under a badge saying the metrics were computed from live events, with a RAG colour derived from them. Audit events carry no resolution timestamp, so nothing there measures how long anything took. |
| **Models** — risk tier and eval score | Models with no governance record show **Untiered** and \`—\` instead of Tier 3 and 75, and the Avg Eval Score KPI moved 76 → **82** with "9 of 50 evaluated" stated | The catalog merge defaulted every model without a seeded governance record to \`Tier 3\` — the most permissive tier in the scheme — which covered **41 of the 50** models on screen and rendered emerald, as though each had been reviewed and judged low risk. The eval score defaulted to 75, which sits in the amber band, so an unevaluated model showed what looked like a real middling result. The KPI then averaged over the whole catalog counting those 75s, so four fifths of that number was the placeholder. The model **Recommendation** weights eval quality at 40%, so it was being decided by the constant too; it now ranks only models that have been evaluated and says how many it left out. |
| **Agent Registry** — Agent 360 drawer | Clicking a live agent now opens its detail panel, with every field AWS cannot measure per agent marked as such | The drawer looked the agent up in the seeded registry array instead of using the row it was opened from, so all 36 live agents resolved to nothing and the panel silently refused to open — 36 of 53 rows looked clickable and weren't, while the 17 seeded rows opened fine. Simply fixing the lookup would have been worse: the placeholder values the live mappers use for what AWS does not attribute per agent were rendered as fact — an **L3 Supervised** autonomy level, an **Approved** governance state, a 100 req/min throttle, **0 invocations / 0% errors / $0** (with the error rate painted green), and **"0 incidents in last 90 days"** reading as a verified clean record. Those now read \`—\` with an explanation. The OWASP threat profile is withheld for live agents rather than shown, because every input it derives from is a placeholder. |
| **Compliance** — downloaded reports | Sample reports now say so inside the file, in the closing summary, and in the filename | Three downloads left the browser titled as compliance documents with nothing marking them as illustrative — the badge on screen does not travel with a file. A button labelled **Export for Filing** produced a *NAIC Unfair Discrimination Testing Report* ending "Report generated for NAIC Model Bulletin compliance", though every ratio, sample size and confidence interval in it is a constant in the source. The GPAI card produced an *EU AI Act Article 53 Compliance Document* from one sample record reused for every model, plus a JSON export with no marking at all — the worse of the two, since JSON is what another system would read as input. All three now carry a header, a footer, and a \`SAMPLE_NOT_FOR_FILING_\` filename; the JSON nests its payload under \`data\` behind an \`_isSampleData\` flag. The button now reads **Export Sample Report**. |
| **Compliance** — framework deep dives | Each framework deep dive now shows its own source badge instead of inheriting the page header's | Twelve views dropped their badge when rendered inside the Compliance Center, which is the only place most of them are ever rendered. The page header can read "Live attestations from the control-plane backend", so a framework whose controls are entirely seeded sat under a green Live claim with nothing of its own to contradict it. The worst case was NAIC's **Unfair Discrimination Testing** panel: its only badge lived in a standalone header no one reaches, so its illustrative disparate-impact ratios — the input to a **Export for Filing** regulator submission — rendered under NAIC's Live badge. |
| **Compliance** — three unreachable deep dives | SR 26-2, OWASP LLM and OSFI E-23 deep dives now open | Their entries in the framework-to-view map were keyed \`sr-26-2\`, \`owasp-llm-top-10\` and \`osfi-e-23\`, but the actual framework ids are \`sr26-2\`, \`owasp-llm-top10\` and \`osfi-e23\`. A key miss falls through to a "Deep dive view not available" placeholder rather than failing loudly, so three fully built views were dead from their only entry point. |
| **Risk**, **Safety**, **Data Governance** — merged counts | Coverage badges on vulnerabilities, evaluation jobs, runtime invocations, knowledge bases and guardrail activity | These numbers are merged across governed regions too. Each one now states its own coverage, rather than only the two surfaces that happened to be badged first. Vulnerability counts in a two-region account read \`1/2 live\`, because Inspector is enabled in one of them. |
| **All merged reads** | A slow or unreachable region is reported, not waited on indefinitely | A region brought under governance but not enabled on the account does not fail fast — AWS retries until its budget runs out. Every merged read fanned out to it and the platform stopped responding. Merged reads are now wall-clock capped. |
| **Guardrails** — blocked vs intervened | Blocks and interventions reported separately | An *intervention* includes masking a phone number out of a response that was still delivered; only a *block* is a refusal. In the reference account 301 of 307 invocations were intervened on and **none** were blocked, so reporting interventions as blocks would have shown a 98% block rate on a fleet that refused nothing. |
| **Operations** — fleet size | The whole governed fleet — **36 agents** in the reference account (7 Bedrock, 29 AgentCore) — where it previously showed **1** | The Operations Hub looked for the governed fleet in the region holding this platform's own tables, not the region the fleet is in. **A wrong region does not fail.** The AWS call succeeds and returns that region's inventory, which is smaller or empty, so a one-agent fleet rendered under a \`Live\` badge with nothing to contradict it. Region resolution is now split by what the data is — this platform's tables, the governed estate, and account-wide endpoints each resolve separately. See "Which regions a number covers". |
| **Operations** — Incidents tab | Live, and empty on purpose: \`0\` incidents under a \`Live\` badge with "No incidents recorded in the Operations store." | The tab read a table name that had never been provisioned in any region, so it could only ever serve illustrative rows. It now reads a real control-plane table. A measured empty list from a reachable store **is** live data — the honest reading is \`0\`, not \`—\`. |
| **Compliance** — attestations surviving a restart | Attestations persist | The attestation table name and region were hardcoded in the route and pointed at a table that existed in neither region. The existence check failed once, cached its answer, and every attestation write went to a process-level dictionary instead — returning \`200\` and disappearing on the next restart. Both the name and the region are now settings resolved the same way as every other control-plane table. |

## What each unmeasured metric would need

Nothing below is a promise of a future release. It is a list of the signals that are absent from the connected account, so you can decide whether the metric is worth turning on.

| Unmeasured today | What would make it measurable |
|------------------|-------------------------------|
| Mean time to detect (MTTD) | A CloudWatch alarm that actually covers your AI workloads (Bedrock, AgentCore). In the reference account there are 85 alarms and none of them watch AI services, so no detection event exists to measure from. |
| Cost for an individual agent | An activated cost allocation tag applied per agent, so AWS billing can split spend by agent rather than only by service. |
| Developer AI token counts | Bedrock model invocation logging enabled. Without it there is no token record to read, for any tool or team. |
| Cost of a model with no published rate | A published per-token price for that model. Costs are never estimated by borrowing another model's rate. |
| Data Quality readiness dimension | AWS Glue Data Quality results in the account. It currently returns none, so the dimension is left unscored and the readiness score discloses that it covers 6 of 7 dimensions. |
| Realised savings and return on investment | A system of record for realised savings. The platform has none, which is why those series were removed from the FinOps trend chart rather than modelled. |
| Masking and redaction attributed to one guardrail | A per-guardrail sensitive-data metric from AWS. CloudWatch publishes this account-wide only, so the figure is shown account-wide rather than split across guardrails by guesswork. |
| Fleet availability, in the uptime sense | Health samples taken over time — a Synthetics canary or an Application Signals SLO per agent. The platform reads health only as a point-in-time check, so it can report the share of agents healthy *now* but has no history to compute uptime against. Today even the snapshot is unmeasured: no agent returns a health datapoint, so the tile reads \`—\` rather than 0%. |
| Resources in a governed region that cannot be reached | Nothing on your side, usually — a region that fails or times out is named in the response, and the merged total is reported as a floor. Panels that read a single region are marked as such rather than implying wider coverage. |

## When numbers legitimately move

Two more things that are expected behaviour, not defects:

- **Month-to-date figures are partial.** The current month on a spend chart covers only the days elapsed so far and is flagged as month-to-date. It will look low next to completed months, and it will keep rising until the month closes.
- **Coverage-based scores rise as your tagging improves.** Fleet maturity pillars are now ratios over your real AI estate. Tag more resources with an owner, a project, and an access scope and the scores go up on their own. That is the point: a score that cannot move is not a measurement.`,
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

### Cross-Module Baseline (useGovernanceAggregator)

The shared \`useGovernanceAggregator\` hook — which feeds the Command Center and ~25 downstream Govern surfaces — now derives its baseline from live sources instead of hardcoded values, each with per-payload \`live\` gating and mock fallback:

- \`governCostApi.budgets()\` — **primary** source for monthly spend and budget utilization from live AWS Budgets (\`DescribeBudgets\`, 1 real budget), which also drives the Command Center budget card. Replaces the former hardcoded \`BU_BUDGETS\` mock; fallback order is direct Budgets → Command Center aggregate budgets → Cost Explorer spend → 0 (no mock on the live path)
- \`governCommandCenterApi.getData()\` — cost anomalies and models-in-production (from CloudWatch runtime metrics); its budget figures now serve only as a secondary fallback
- \`complianceApi.getPosture()\` — frameworks covered, controls implemented/total, frameworks needing attention, and the compliance half of the trust baseline
- \`governModelsApi.catalog()\` — total foundation-model count
- \`maturityApi.list()\` — org maturity composite, blended into the trust baseline

Incident summary, savings realized/target, and models-pending-review have no clean live source and remain mock.

## Risk Posture Panel

The **Risk Posture** panel breaks findings down by severity (critical, high, medium, low). It previously rendered silently blank — no values, no explanation — because of a defect in how the severity breakdown was retrieved. It now populates from **AWS Security Hub** and carries a \`Live\` badge.

If Security Hub is not reachable or not enabled in your account, the panel says so instead of showing zeros: an unpopulated severity tile means "we could not read your findings", not "you have no findings".

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
- Autonomy level tracking (L0-L4)

## What the Headline Counts Include

The KPI tiles at the top of the Agent Registry count **only agents actually discovered in your connected AWS account**.

Demo agents are still listed in the tables below, so you can see how the registry behaves with a populated fleet, but each carries a per-row \`Demo\` marker and none of them are added to the headline totals or to any provider split. In the reference account this moved the agent count from 53 down to **36**: the 36 are real, the other 17 were seeded examples that had been quietly padding the total.

The tile caption tells you the split (how many were discovered live, how many demo rows were excluded), so the two views never disagree without saying why.

## Governance Status

Governance status for AWS agents is now derived from the agent's **real resource tags**:

| Evidence found on the agent | Status shown |
|-----------------------------|--------------|
| A governance tag **and** an accountable owner | Compliant |
| Tag evidence present but incomplete | Non-compliant / review needed |
| No tag evidence at all | **Unknown** |

Previously every AWS-discovered agent was pinned to "review needed" regardless of how well it was actually governed, which made the status column useless for triage. Agents with no tag evidence now show \`Unknown\` rather than being guessed at in either direction — a well-governed agent that simply is not tagged is not evidence of non-compliance, and an untagged agent is not evidence of compliance either.

Because the status is read from tags, tagging an agent with an owner and a governance tag changes its status on the next refresh.

## Cost Attribution: Provider Yes, Per-Agent No

This is the most common question about this screen, so it is worth stating plainly.

- **Provider cost for AWS is real.** The AWS figure is measured spend for the whole AI estate, pulled from AWS Cost Explorer.
- **Per-agent cost is unmeasured** and displays as \`—\`.

The AWS bar is **not** the sum of the per-agent costs, and it cannot be. No AWS billing API attributes Bedrock or AgentCore spend to an individual agent. Billing data arrives grouped by service and by cost allocation tag, so unless an activated cost allocation tag is applied per agent, the only honest per-agent answer is "unknown".

Dividing the estate total across agents would produce a number for every row, and every one of those numbers would be wrong. The platform declines to do it.`,
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
- **AgentCore Identity** — Workload (machine) identities issued to fleet agents, with scoped resource access (distinct from human SSO federation in Secure → Identity)

## Live Data Sources

- \`governAgentCoreApi.agents()\` — Agent discovery and status
- \`governAgentCoreApi.workloadIdentities()\` — AgentCore workload identities and their allowed resources
- Computed risk heatmap from agent compliance status and platform type

## Maturity Pillar Scores

The 5-pillar posture scores are now **coverage ratios over your real AI estate**, not point formulas.

| Pillar | What the score measures |
|--------|-------------------------|
| **Registry** | The share of AI resources that carry a governance tag — is the resource in the inventory at all? |
| **Access** | The share of AI resources that carry an access-scope tag. |
| **Security** | Implemented controls as a share of total controls. |
| **Visualization** and **Interop** | Still indicative rather than measured, and labelled as such on the card. |

**Your scores will be lower than they were.** The previous formulas saturated at 90% or 100% for any fleet with more than a trivial number of agents, so the pillars looked healthy no matter what the fleet's actual governance coverage was. A score that always reads 100% is not telling you anything.

The upside is that the scores now **move**. Tag more of your AI resources with an owner, a project, an environment, and an access scope and the Registry and Access pillars climb on their own. If the estate scan cannot run, those pillars show \`—\` and drop out of the live badge rather than falling back to a flattering estimate.

## Guardrail Counts: Live Telemetry vs. AVA Templates

Two different things on this page used to be described with the same word, which made the numbers look contradictory. They are now labelled separately:

- **Guardrail activity metrics** (interventions, blocks, invocations shown as fleet telemetry) come from **live Bedrock guardrail telemetry** — what your guardrails actually did in your account.
- **The guardrail list** in the control-plane table is the set of **AVA-managed guardrail templates** — what this platform defines and can deploy. It is now explicitly labelled as a template list.

An account can legitimately have live guardrail activity with no AVA-managed templates, or templates with no activity yet. Counting the two together would misrepresent both.

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
| **Availability & Routing** | Foundation-model availability, cross-region inference profiles, and intelligent prompt routers |
| **Operations** | Monitoring, dependency graph, analysis tools |

## Sub-Features

- **Hallucination Detection** — Ground truth comparison
- **LLM Monitoring Patterns** — See dedicated section below
- **MRM Framework Explorer** — Model Risk Management alignment
- **Model Comparison** — Side-by-side capability analysis
- **Risk Scoring Calculator** — Interactive risk tier computation
- **Dependency Graph** — Model-to-agent relationship visualization
- **Model Lineage** — Live SageMaker ML Lineage graph (artifacts, contexts, associations)

## Model Lineage & Provenance

The **Model Lineage** viewer renders the SageMaker ML Lineage graph — artifacts, contexts, and their associations — from \`GET /govern/sagemaker/lineage\` (SageMaker \`ListArtifacts\` / \`ListContexts\` / \`ListAssociations\`, live source \`sagemaker-lineage\`) via the \`useModelLineage\` hook. A demo SageMaker estate is seeded in this account, so the viewer renders a **real** graph of ~31 lineage entities from a seeded training → model → endpoint pipeline (account IDs masked server-side). Accounts with no SageMaker lineage entities show an honest empty state (still \`live: true\`) instead of fabricated nodes. The previously fabricated ML-SBOM differential-privacy block (DP-SGD / PATE / epsilon-delta) has been **removed** — the ML-SBOM export no longer emits synthetic privacy governance data.

## Data Quality Drift — Now Live (On-Demand Analyzer)

The **Data Quality Drift** panel (\`ModelMonitoring.tsx\`, on the Operations tab's monitoring surface) reads a real SageMaker Model Monitor **DATA_QUALITY** analysis from S3 via \`governSageMakerApi.modelMonitor()\` (\`GET /govern/sagemaker/model-monitor\`) — the baseline constraints / statistics compared against the monitor-results \`constraint_violations.json\`. It surfaces baseline feature count, drift-violation count, analyzer run status, per-feature baseline-vs-current statistics, and the monitored endpoint, gating its \`Live\` badge on the payload \`live\` flag with an honest pending / unreachable note (never fabricated numbers).

**Maintenance-mode caveat (load-bearing):** SageMaker Model Monitor *scheduling* is in AWS maintenance mode (unavailable to new customers), so this drift is produced by an **on-demand analyzer processing job** and read from S3 — not by a live monitoring schedule.

**Still illustrative (Mock):**
- **Other model KPIs** — safety and hallucination drift indicators remain Mock (no live feed yet); invocation, latency, and error-rate metrics are already live from CloudWatch.
- **Clarify SHAP attributions** — SageMaker Clarify processing is in AWS maintenance mode (unavailable to new customers), so real SHAP cannot be produced in this account; the SHAP / LIME / Anchor feature attributions stay illustrative with an honest note. This is a platform **maintenance-mode block, not a wiring gap** — the Clarify job-list read (\`ListProcessingJobs\`) remains wired.

## LLM Monitoring Patterns (Operations Tab)

Traditional ML monitoring (Model Monitor) does not transfer to LLM use cases. This sub-tab provides patterns for Bedrock output quality monitoring using CloudWatch and custom metrics.

**8 Quality Dimensions:**
| Dimension | Description | Source |
|-----------|-------------|--------|
| Groundedness | Response grounded in retrieved context | Guardrail / Eval |
| Relevance | Response addresses the query | Guardrail / Eval |
| Coherence | Logical flow and consistency | Eval |
| Harmful Rate | % responses triggering content filters | Guardrail |
| Refusal Rate | % appropriate refusals | Guardrail |
| Latency P99 | 99th percentile response time | CloudWatch |
| Tokens/Response | Average output tokens | CloudWatch |
| Citation Accuracy | Correct source attribution | Eval |

**Features:**
- Live status from existing Bedrock Guardrails
- Current metric values from CloudWatch (AWS/Bedrock namespace)
- One-click CloudWatch dashboard deployment
- CloudWatch alarm creation for quality thresholds
- 5 educational tabs: Overview, Metrics, CloudWatch Setup, Alarms, Best Practices

**Custom Metrics Namespace:** \`AVA/LLMQuality\`

**Live Data:** \`governLlmQualityApi.status()\`, \`governLlmQualityApi.metrics()\`, Bedrock Guardrails

## LLM Output Quality — Now Live (Derived Proxy)

The \`AVA/LLMQuality\` namespace is now populated by a backend background producer (\`core/llm_quality_producer.py\`) started at app startup and running on its own interval (\`GOVERN_LLM_QUALITY_INTERVAL\`, default 300s). It reads the account's live governance telemetry, derives genuine quality signals from it, and publishes only those signals to the namespace the AI Quality dashboard already reads — so the dashboard flips from Mock to **Live** with no read-path change.

These metrics are a **governance-grade proxy derived from existing telemetry (guardrails + invocation logs + Bedrock evaluations)**, not a direct per-response measurement of model output. Derivation mapping:

| Dimension | Derived from |
|-----------|--------------|
| Harmful Rate | Guardrail \`ContentPolicy\` intervention rate |
| Groundedness | Bedrock eval-job scores (groundedness / faithfulness) when present, else guardrail \`ContextualGrounding\` intervention rate (proxy) |
| Relevance / Coherence / Citation Accuracy | Bedrock evaluation-job per-metric mean scores (completed jobs only) |
| Refusal Rate | Invocation-safety guardrail-intervention rate |
| Tokens / Response | Invocation-safety output-token sums ÷ calls |
| Latency P99 | Sourced directly by the read path from \`AWS/Bedrock\` (not published by the producer) |

**Honesty (load-bearing):** a dimension is published only when its underlying signal is genuinely live that cycle. Eval-quality dimensions (relevance, coherence, citation accuracy, and direct groundedness) are **skipped when completed eval jobs carry no such metrics**; harmful-rate and the grounding proxy are skipped when there are no live guardrail invocations; refusal-rate and tokens/response are skipped when there are no invocation logs. Nothing synthetic or random is ever published.

## Availability & Routing (NEW)

The **Availability & Routing** tab answers "what can this account run, and how are requests routed?" with three live panels, each gating its \`Live\` badge on its own payload and showing an honest empty state when nothing is returned:

- **Foundation Model Availability** — reuses the live Bedrock catalog (\`ListFoundationModels\`, ~121 foundation models) to summarize invokable models by provider, input modality, and lifecycle (live source \`Bedrock ListFoundationModels\`).
- **Inference Profiles** — cross-region inference profiles from \`governModelsApi.inferenceProfiles()\` (\`GET /govern/models/inference-profiles\`, ~71 profiles) with a system-defined vs application-defined split, and per-profile status, model count, and target regions (live source \`bedrock-list-inference-profiles\`).
- **Prompt Routers** — intelligent prompt routers from \`governModelsApi.promptRouters()\` (\`GET /govern/models/prompt-routers\`, 3 routers) showing status, model count, and fallback model (live source \`bedrock-list-prompt-routers\`).

## RAG Evaluations (Live)

The **Evaluations → RAG Evaluation** sub-tab leads with a live panel (\`LiveRagEvals\`) built on \`governEvalsApi.jobs()\` filtered to \`application_type === "RagEvaluation"\` — the account's real Bedrock RAG (Knowledge Base) evaluation jobs (\`bedrock:ListEvaluationJobs\`, live source \`ListEvaluationJobs\`). Clicking a completed job lazily loads its S3-parsed **per-metric mean scores** via \`governEvalsApi.scores(jobName)\` (live source \`S3 eval results\`), rendered as per-metric bars with responsible-AI metrics flagged "lower is safer."

**Still illustrative (Mock):** the per-query "studio" drill-down (per-case faithfulness, context relevance, retrieved-context inspection) remains illustrative because \`scores()\` returns aggregated means only, not per-query records. The \`ModelEvaluations\` (model-eval) live embed is unchanged; its sample jobs are relabeled as illustrative.

## Live Data Sources

- \`governModelsApi.catalog()\` — Bedrock foundation model catalog
- \`governModelsApi.runtimeMetrics()\` — Model invocation metrics
- \`governModelsApi.inferenceProfiles()\` — Cross-region inference profiles (\`bedrock-list-inference-profiles\`)
- \`governModelsApi.promptRouters()\` — Intelligent prompt routers (\`bedrock-list-prompt-routers\`)
- \`governCostApi.byModel()\` — Per-model cost breakdown
- \`governEvalsApi.jobs()\` — Bedrock evaluation jobs (Model + RAG); the RAG panel filters \`application_type === "RagEvaluation"\`
- \`governEvalsApi.scores()\` — S3-parsed per-metric mean scores for a completed eval job
- \`governLlmQualityApi.status()\` — LLM monitoring infrastructure status
- \`governLlmQualityApi.metrics()\` — LLM quality dimension metrics
- \`useModelLineage\` → \`GET /govern/sagemaker/lineage\` — SageMaker ML Lineage graph, ~31 entities from the seeded demo pipeline (live source \`sagemaker-lineage\`; honest empty state when no entities exist)
- \`governSageMakerApi.modelMonitor()\` → \`GET /govern/sagemaker/model-monitor\` — SageMaker Model Monitor data-quality drift: baseline constraints vs analyzed capture read from S3 via an on-demand analyzer (Model Monitor scheduling is in AWS maintenance mode)`,
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
| **Capacity** | AWS Service Quotas monitoring for AI services |
| **ROI** | Agent ROI calculator with value metrics |
| **Task Fit** | Task assessment for AI suitability |
| **Business Metrics** | Business value tracking |
| **Unit Economics** | Per-invocation cost analysis |
| **Token Economics** | Token usage patterns, prompt-cache read/write volume, model-level breakdown |
| **Chargeback** | Cost allocation by tag/business unit |
| **Optimization** | Savings recommendations |
| **Cost Anomalies** | Detailed anomaly analysis and shadow AI detection |

## Choosing the spend period

The Cost Explorer panels on the **Dashboard** tab are scoped by a period control at the **bottom of the AWS
Spend card**. Five presets, matching what you would pick in Cost Explorer itself:

| Preset | Period | Complete? |
|--------|--------|-----------|
| **Month to date** | Current calendar month so far | No — still accruing |
| **Last month** | Previous calendar month | Yes |
| **3 months** | Last 3 calendar months | No — includes the current month |
| **6 months** | Last 6 calendar months | No — includes the current month |
| **1 year** | Last 12 calendar months | No — includes the current month |

Four of the five include the current, still-accruing month, so their totals cover a **partial** period and are
not comparable like-for-like with a closed month. The control says so beneath the buttons rather than leaving
you to work it out — and it is why the monthly trend shows a low final bar.

**Changing the period does not blank the page.** The previous figures stay on screen, dimmed, with an
**"Updating…"** marker until the new ones land. That marker matters: while it is showing, the numbers you are
looking at are from the *previous* period even though the label has already changed.

**Some panels cannot follow a long selection.** Daily trend, anomalies, per-use-case spend and AgentCore costs
are capped at 90 days by their data sources (per-resource costs, 14 days). Those panels state the window they
are actually showing — e.g. *"Daily Spend (90 days (max for this source))"* — instead of inheriting the
heading, so a 90-day series is never presented as a year.

**Going back further than about 13 months** needs AWS Cost and Usage Reports; that is the retention limit of
the Cost Explorer API, not a limit of this dashboard. Note that switching CUR on does not backfill — its
history begins at first delivery.

## Capacity Management (NEW)

The **Capacity** tab monitors AWS Service Quotas to prevent capacity breaches that could halt AI workloads.

**Features:**
- Real-time quota usage monitoring across AI services
- At-risk alerts (>80% used) and critical alerts (>90% used)
- Quota increase request submission (ADMIN role required)
- Usage trend charts (7-day history from CloudWatch)
- Color-coded status: green (<70%), amber (70-90%), red (>90%)

**Tracked Services:**
| Service | Key Quotas |
|---------|-----------|
| **Bedrock** | Model invocations/min, provisioned throughput, guardrails |
| **SageMaker** | Endpoint instances, training jobs, notebook instances |
| **Lambda** | Concurrent executions, function count |
| **CloudWatch** | Custom metrics, alarms, dashboards |
| **IAM** | Roles, policies per account |

**Live Data:** \`governCapacityApi.quotas()\`, \`governCapacityApi.alerts()\`, \`governCapacityApi.history()\`

## Live Data Sources

- \`governCostApi.summary()\` — Aggregate AI spend
- \`governCostApi.trend()\` — Historical spend trends
- \`governCostApi.forecast()\` — Spend projections
- \`governCostApi.byModel()\` — Per-model breakdown
- \`governCostApi.byUseCase()\` — Per-use-case breakdown
- \`governCostApi.byTag()\` — Cost allocation tag breakdown
- \`governCostApi.tagKeys()\` — Available cost allocation tags
- \`governCostApi.anomalies()\` — Spend anomaly detection
- \`governCostApi.budgets()\` — live AWS Budgets (\`DescribeBudgets\`); now the **primary** source for budget-vs-actual across FinOps, the Command Center budget card, and \`useGovernanceAggregator\`, replacing the hardcoded \`BU_BUDGETS\` mock
- \`governCapacityApi.quotas()\` — Service Quotas usage
- \`governCapacityApi.alerts()\` — Capacity breach alerts

## Features

- Real AWS Cost Explorer integration
- Anomaly detection with alerts
- Tag-based chargeback with selector
- Budget vs actual variance tracking
- Service Quotas capacity monitoring

## Monthly AWS Spend Trend (renamed)

The chart previously titled **"Value Creation Trend"** is now **"Monthly AWS Spend Trend"**, and it plots one thing: real monthly AWS spend.

The **savings** and **ROI** series have been **removed**. The platform has no system of record for realised savings, so both series were being generated rather than measured — and a savings line that is generated is the single most misleading thing a FinOps dashboard can show, because it is the number executives quote. Rather than model it and label it, the series is gone until there is something real to plot. See **How to Read the Numbers** for the reasoning.

What remains is honest and useful:

- Each completed month is that month's **actual billed AWS spend**.
- The **current month is month-to-date** and is flagged as such in the legend. It covers only the days elapsed so far, so it will always look low next to a completed month and will keep rising until the month closes. Do not read a month-to-date bar as a decline in spend.

## AgentCore Compute Cost

AgentCore compute cost previously showed \`$0.00\` on every screen, always — not because AgentCore was free, but because the value was never actually being calculated. A permanent \`$0.00\` in a cost tile reads as "this costs us nothing", which was wrong.

It now shows **real billed compute spend**, allocated across your AgentCore runtimes in proportion to each runtime's **measured CPU and memory hours**. Runtimes that consumed no CPU or memory in the window are not given a share.

The allocation is a split of money AWS actually billed you, by usage the platform actually measured. It is not a list-price estimate.`,
      },
      {
        id: 'govern-compliance',
        title: 'Compliance',
        content: `# Compliance

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
- **Preventive Controls (SCPs)** — live AWS Organizations Service Control Policies (see below)
- **KMS Encryption-at-Rest Evidence** — live KMS key inventory in the AI Security Controls panel (see below)
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

## Preventive Controls (SCPs) & KMS Encryption Evidence (NEW)

Two new live governance-posture surfaces:

- **Preventive Controls (SCPs)** — the \`PreventiveControlsCard\` in \`ComplianceCenter.tsx\` lists real AWS Organizations Service Control Policies via \`governScpApi.policies()\` (\`GET /govern/governance/scp\`, live source \`Organizations\` / \`organizations:...\`). SCPs are org-level guardrails that cap what any account can do regardless of IAM. The card is honest about limits: when the account is not the org management / delegated-admin account, Organizations returns AccessDenied and an explanatory note is shown; when the only policy is the AWS-managed \`FullAWSAccess\` default, it is labeled as such rather than implying a restrictive posture.
- **KMS Encryption-at-Rest Evidence** — the AI Security Controls panel (\`compliance/AISecurityControlsPanel.tsx\`) adds a live KMS key inventory from \`governKmsApi.inventory()\` (\`GET /govern/governance/kms\`, live source \`KMS\` / \`kms:...\`): ~20 keys (customer-managed keys with automatic-rotation status plus AWS-managed keys) and total aliases. It complements the Security-Hub-inferred encryption control (ai-sec-004) with direct \`kms:ListKeys\` evidence, and shows an honest note when KMS is unreachable or \`kms:ListKeys\` is not granted.

## AWS Config Rules Compliance (NEW)

The **Security Hub** tab adds an **AWS Config Rules** card (\`AwsConfigRulesCard\` in \`ComplianceCenter.tsx\`) backed by \`governControlsApi.configRules()\` (\`GET /govern/controls/config-rules\`, live source \`aws-config\`). It surfaces the account's real AWS Config rule set (~710 rules) with per-rule compliance — compliant, non-compliant, not-applicable, and insufficient-data — alongside summary tiles. All counts come straight from the live response; the card shows an honest note (and a \`MockDataBadge\`) when Config is not enabled, \`config:Describe*\` is not granted, or no rules exist. This complements the framework deep-dive control evaluation and the Config-vs-Guardrails side-by-side view already in the module.

> **Fixed (this wave):** framework attestations for \`osfi-e23\`, \`naic-ai\`, \`colorado-ai-act\`, \`mitre-atlas\`, and \`nist-genai-profile\` previously returned 404 — those frontend framework ids are now registered in the backend and attestation reads/writes succeed.

## Supported Frameworks

**14 frameworks, 281 controls**, measured from \`GET /govern/compliance/posture\`. The names below are
the \`framework_name\` that endpoint returns verbatim, so this table can be diffed against
\`FRAMEWORK_META\` in \`backend/src/api/routes/govern_compliance.py\` — two of them named superseded
instruments until they were corrected there (the 2023 NAIC Model Bulletin in place of the AI Systems
Evaluation Tool that builds on it, and "Colorado SB 205" for what is now SB 26-189):

| Framework | \`id\` | Controls |
|---|---|---|
| SR 26-2 | \`sr26-2\` | 16 |
| NIST AI RMF | \`nist-ai-rmf\` | 15 |
| EU AI Act | \`eu-ai-act\` | 19 |
| Data Sensitivity | \`data-sensitivity\` | 14 |
| AWS RAI Lens | \`aws-rai-lens\` | 35 |
| CRI FS AI RMF | \`cri-fs-ai-rmf\` | 45 |
| ISO 42001 | \`iso-42001\` | 16 |
| OWASP LLM Top 10 | \`owasp-llm-top10\` | 24 |
| FINOS AIR | \`finos-air\` | 34 |
| OSFI E-23 | \`osfi-e23\` | 15 |
| NAIC AI Systems Evaluation Tool | \`naic-ai\` | 16 |
| Colorado AI Act (SB 26-189) | \`colorado-ai-act\` | 6 |
| MITRE ATLAS | \`mitre-atlas\` | 14 |
| NIST GenAI Profile | \`nist-genai-profile\` | 12 |

This is the Compliance Center's own inventory. It is **not** the same list as the **Governance Assessment** wizard, which scores organisational maturity against 11 regulatory frameworks — the two are deliberately different sizes and should not be reconciled.

## How much of that is actually assessed

**24 of the 281 controls are assessed — 8.5%.** All 24 were set by auto-detection; none has a human attestation behind it. The other 257 are **not assessed**, which is not the same as failing.

**Every auto-detected result is an existence probe, not an efficacy test.** It asks whether the AWS resource a control depends on is present, then marks the control \`pass\`. Two CloudTrail trails existing is enough to mark NIST AI RMF **MANAGE 3.1** as passing; the probe does not look at what those trails cover, whether they are validated, or whether anyone reads them. Read a passing auto-detected control as *"the prerequisite exists"* — never as *"this control was tested and works"*. Each one records the source it came from, so the basis of the claim travels with it. The 24 assessed today came from eight sources: \`cloudwatch\` (6), \`bedrock-guardrails\` (5), \`bedrock-agents\` (4), \`iam\` (3), \`api-gateway\` (2), \`cloudtrail\` (2), \`cost-explorer\` (1), \`secrets-manager\` (1).

Attestations are stored in the control-plane compliance table and survive a restart. A response reporting \`source: memory\` means persistence is not working, and the attestations in it will be lost.

## Live Data Sources

- \`governPostureApi.configRuleDetail()\` — AWS Config compliance
- \`governControlsApi.configRules()\` — AWS Config rule set + per-rule compliance (~710 rules; live source \`aws-config\`)
- \`governConformanceApi\` — Conformance tracking
- \`complianceApi\` — Attestation management
- \`policiesApi.getObservability()\` — Cedar policy decisions
- \`maturityApi\` — Plan maturity assessments
- \`governScpApi.policies()\` — AWS Organizations Service Control Policies (source \`organizations:...\`)
- \`governKmsApi.inventory()\` — KMS key + alias inventory, encryption-at-rest evidence (source \`kms:...\`)
- \`governControlsApi.evaluate()\` — live control evaluation overlaid on the framework deep-dive views via \`useControlEvaluation\`. Controls carrying an \`autoDetectSource\` are auto-evaluated from their AWS source (with per-source \`live\` gating and latency); controls without one keep their attestation status.

## Framework Deep-Dive Live Coverage

Ten of the 14 frameworks have a deep-dive view. Seven of those ten wire live control evaluation; the other three are static / attestation-only.

| Framework View | Live Control Evaluation |
|----------------|-------------------------|
| **OWASP LLM Top 10** | Yes — \`governControlsApi.evaluate()\` |
| **FINOS AIR** | Yes |
| **NAIC AI** | Yes |
| **CRI FS AI RMF** | Yes |
| **EU AI Act** | Yes |
| **OSFI E-23** | Yes |
| **NIST AI RMF** | Yes |
| SR 26-2 | No — static / attestation only |
| ISO 42001 | No — static / attestation only |
| MITRE ATLAS | No — static / attestation only |

The remaining four — Data Sensitivity, AWS RAI Lens, Colorado AI Act, and NIST GenAI Profile — have no deep-dive view at all. Selecting Deep Dive for one of them shows "Deep dive view not available" and points you at the Checklist view, rather than rendering an empty framework page.`,
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
| **Invocations** | Per-invocation telemetry table (metadata only — no prompt/response content) plus aggregates |
| **Heatmap** | Violation patterns by category |
| **Scorecard** | Metrics summary |
| **AgentCore** | Agent-specific metrics |
| **Analytics** | Trend analysis and reporting |

## Live Data Sources

- \`guardrailsApi.list()\` — Bedrock guardrail configurations
- \`governGuardrailsApi.telemetry()\` — Guardrail intervention metrics
- \`governInvocationSafetyApi.telemetry()\` — Aggregate invocation safety metrics
- \`governInvocationSafetyApi.invocations()\` → \`GET /govern/invocation-safety/invocations\` — per-invocation metadata rows (live source \`bedrock-invocation-logs\`)

## Per-Invocation Telemetry (Metadata Only)

The **Invocations** view (\`LivePromptTelemetry.tsx\`) renders a per-invocation table below the aggregates, read from Bedrock model-invocation CloudWatch logs via CloudWatch Logs Insights. **By design it surfaces metadata only** — timestamp, model, operation, stop reason, input/output token counts, and guardrail action — and **never prompt or response content**. The table carries the honest label "Metadata only — prompt and response content are never surfaced."

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
        id: 'govern-marketplace',
        title: 'Marketplace',
        content: `# AI Resource Marketplace

Navigate to \`/aaas/marketplace\` (Build) or \`/govern/marketplace-admin\` (Admin). **Cross-Module Feature**

Internal marketplace for discovering, subscribing to, and governing AI resources across the organization. The consumer catalog lives in Build (AaaS), while governance administration lives in Govern.

## Resource Types

| Type | Description | Example |
|------|-------------|---------|
| **Agent** | Deployed AI agents | KYC Verification Agent |
| **MCP Server** | Model Context Protocol endpoints | Market Data Server |
| **Knowledge Base** | RAG knowledge sources | Policy & Compliance KB |
| **Skill** | Reusable agent capabilities | Document Analysis |
| **Model** | Fine-tuned or custom models | Domain-specific LLM |

## Governance Features

### Risk-Based Approval Chains

Subscriptions require approval based on resource risk level:

| Risk Level | Approval Chain |
|------------|----------------|
| **Low** | Owner team only |
| **Medium** | Owner team → Compliance |
| **High** | Owner team → Compliance → Security |
| **Critical** | Owner team → Compliance → Security → Executive |

### Guardrails & Policy Integration

Each listing can specify:
- **Required Guardrails** — Content filters, PII detection applied to all invocations
- **Policy Engine** — Cedar policy enforced at runtime
- **Data Classification** — public, internal, confidential, restricted

### Compliance Controls

- **Attestation** — User must accept terms before access
- **Compliance Frameworks** — SOC2, PCI-DSS, HIPAA tagging
- **Recertification** — Periodic access review (configurable interval)

### Cost Governance

- **Budget Limits** — Per-subscription monthly spend caps
- **Cost Center Attribution** — All usage tracked to business unit
- **Usage Metering** — Invocations, tokens, cost per subscriber

### Rate Limiting

- **Per-Minute Limits** — Prevent burst abuse
- **Per-Day Limits** — Cap daily usage
- **Automatic Enforcement** — Entitlement check returns rate status

## Views

| View | Path | Module | Description |
|------|------|--------|-------------|
| **Catalog** | \`/aaas/marketplace\` | Build | Browse and subscribe to resources |
| **My Subscriptions** | \`/aaas/marketplace?tab=my-subscriptions\` | Build | Manage your subscriptions |
| **Admin** | \`/govern/marketplace-admin\` | Govern | Manage listings, approve requests |

## Audit Trail

All marketplace actions are logged with tamper-proof checksums:
- Subscription requests, approvals, denials, revocations
- Attestation acceptances
- Budget alerts and exceeded events
- Entitlement checks (passed/failed)

## API Endpoints

### Listing Management

| Endpoint | Description |
|----------|-------------|
| \`POST /listings\` | Create new listing |
| \`GET /listings\` | List all listings (admin) |
| \`GET /listings/{id}\` | Get listing by ID |
| \`PUT /listings/{id}\` | Update listing |
| \`DELETE /listings/{id}\` | Delete listing |
| \`POST /listings/{id}/publish\` | Publish listing to catalog |
| \`POST /listings/{id}/unpublish\` | Unpublish listing from catalog |
| \`POST /listings/{id}/deprecate\` | Deprecate listing |
| \`GET /listings/{id}/governance\` | View governance requirements |

### Catalog

| Endpoint | Description |
|----------|-------------|
| \`GET /catalog\` | Browse available resources |
| \`GET /catalog/{id}\` | Get catalog item detail |

### Subscriptions

| Endpoint | Description |
|----------|-------------|
| \`POST /subscriptions\` | Request subscription |
| \`GET /subscriptions/mine\` | User's subscriptions |
| \`GET /subscriptions/pending\` | Pending approvals |
| \`GET /subscriptions/{id}\` | Get subscription by ID |
| \`DELETE /subscriptions/{id}\` | Unsubscribe |

### Approval Chain

| Endpoint | Description |
|----------|-------------|
| \`POST /subscriptions/{id}/approve-step\` | Approve step in chain |
| \`POST /subscriptions/{id}/deny-step\` | Deny approval step |
| \`POST /subscriptions/{id}/approve\` | Approve subscription (full) |
| \`POST /subscriptions/{id}/deny\` | Deny subscription |
| \`POST /subscriptions/{id}/revoke\` | Revoke subscription |
| \`GET /subscriptions/{id}/approval-status\` | Get approval status |
| \`GET /approvals/pending/by-type/{type}\` | Pending by approver type |

### Attestation

| Endpoint | Description |
|----------|-------------|
| \`POST /subscriptions/{id}/accept-attestation\` | Accept terms |
| \`GET /subscriptions/{id}/attestation\` | Get attestation requirements |

### Budget & Usage

| Endpoint | Description |
|----------|-------------|
| \`PUT /subscriptions/{id}/budget\` | Set budget limit |
| \`GET /subscriptions/{id}/budget-status\` | Get budget status |
| \`GET /analytics/usage\` | Usage analytics |
| \`POST /subscriptions/{id}/usage\` | Record usage |

### Audit & Entitlement

| Endpoint | Description |
|----------|-------------|
| \`GET /audit-log\` | Query audit trail |
| \`GET /subscriptions/{id}/audit-log\` | Subscription-specific audit |
| \`POST /entitlement/check\` | Runtime access verification |

## Live Data Sources

- \`governMarketplaceApi.catalog()\` — Published listings
- \`governMarketplaceApi.subscriptions()\` — User subscriptions
- \`governMarketplaceApi.auditLog()\` — Audit trail`,
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
| **Knowledge Bases** | Live Bedrock Knowledge Base inventory — names, status, storage type, embedding model, data sources |
| **AI Estate Inventory** | Live tagged-resource inventory of the AI estate (Resource Groups Tagging), grouped by service with an AI-related flag |
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

## Knowledge Bases (NEW)

The **Knowledge Bases** tab (\`data/KnowledgeBaseGovernance.tsx\`) is a live inventory of Amazon Bedrock Knowledge Bases from \`governKnowledgeBasesApi.list()\` (\`GET /govern/knowledge-bases\`, live source \`Bedrock Knowledge Bases\`). It surfaces each KB's name, status, storage type, embedding model, and data sources, with summary tiles (total / active / data sources) and breakdowns by storage type and embedding model. Live-but-empty accounts show an honest empty state.

## AI Estate Inventory (NEW)

The **AI Estate Inventory** page (\`/govern/data/inventory\` → \`govern/data/AiEstateInventory.tsx\`, linked from the Data Governance landing's Lineage tab) is a live inventory of every tagged AWS resource supporting the AI estate, from \`governInventoryApi.resources()\` (\`GET /govern/governance/inventory\`, live source \`resourcegroupstaggingapi:GetResources\`). It reads AWS Resource Groups Tagging, groups resources by service (with a sorted by-service bar chart), and flags each row \`ai_related\` from its service namespace (bedrock, sagemaker, etc.) plus AI-oriented tag heuristics (ai / genai / llm / agentcore). Summary tiles cover total resources, AI-related count, distinct services, and distinct tag keys, with an AI-related-only toggle on the table. ~500 resources are returned (incl. bedrock-agentcore, lambda, eks) and account IDs are masked server-side; live-but-empty accounts show an honest empty state.

## AI Readiness Score: One Ladder, and One Unscored Dimension

The AI readiness score is now a **single consistent scale**. Two different scoring ladders previously ran side by side on the same screen and disagreed with each other about the same data — a dimension could look acceptable in one place and failing in another, with no way for you to tell which was right. There is now one ladder, and every dimension is placed on it the same way.

**Data Quality is deliberately unscored.** AWS Glue Data Quality returns no results in the reference account, so there is no measurement to score. That dimension is shown as an informational card marked "Not measured" and is **excluded from the overall score** rather than being scored as zero — a zero would have dragged the headline number down as though quality had been assessed and failed, when it has not been assessed at all.

Because one dimension is excluded, the score explicitly discloses that it covers **6 of the 7** readiness dimensions. Enabling Glue Data Quality in the account is what would bring the seventh into the score.

> **Fixed (this wave):** the Glue/Macie data services (\`governDataCatalogApi.summary()\`, \`.domains()\`, \`.quality()\`, \`.sensitivity()\`) previously returned 500 due to a \`get_or_load\` call-signature bug; they now return live data.

## Live Data Sources

- \`governDataCatalogApi\` — Glue Data Catalog + Macie integration (\`summary()\` / \`domains()\` / \`quality()\` / \`sensitivity()\`)
- \`governDataSourcesApi\` — **measured** reachability of all 50 catalogued AWS sources (the 7 row statuses are explained under **How to Read the Numbers → "Connected" is measured, not declared**)
- \`knowledgeApi.list()\` — Knowledge registrations
- \`knowledgeApi.listDatabases()\` — Glue databases
- \`knowledgeApi.listKnowledgeBases()\` — Bedrock knowledge bases (Knowledge tab registry)
- \`governKnowledgeBasesApi.list()\` — dedicated Bedrock Knowledge Base inventory for the Knowledge Bases tab (live source \`Bedrock Knowledge Bases\`)
- \`governInventoryApi.resources()\` — tagged-resource inventory of the AI estate for the AI Estate Inventory tab (live source \`resourcegroupstaggingapi:GetResources\`)`,
      },
      {
        id: 'govern-risk',
        title: 'Risk Management',
        content: `# Risk Management

Navigate to \`/govern/risk\`.

Enterprise risk register with heatmaps, assessments, controls library, and issue tracking aligned to NIST AI RMF.

## Tabs

| Tab | Description |
|-----|-------------|
| **Dashboard** | Risk overview with heatmaps and KPIs |
| **Risk Register** | Centralized risk inventory with scoring |
| **Assessments** | Risk assessment workflows |
| **Controls** | Control library and effectiveness tracking |
| **Issues** | Issue tracking and remediation |
| **Third-Party Risk** | Vendor risk management |
| **HRAIS** | High-Risk AI System classification (EU AI Act) |
| **Outcomes** | Post-deployment outcome monitoring |

## Outcome Monitoring Dashboard (Outcomes Tab)

- **Post-Deployment AI Impact Tracking** — Monitor AI system outcomes after deployment
- **Decision Distribution Analysis** — Track how AI decisions are distributed across populations
- **Demographic Parity Metrics** — Measure fairness across protected classes
- **Appeal Rate Monitoring** — Track appeal rates and outcomes for AI decisions
- **Drift Detection** — Detect model drift and outcome shifts over time
- **Consumer Harm Indicators** — Aligned to CRI FS AI RMF harm categories

## Concentration Risk: Now Measured Per Capability

Vendor concentration is calculated **per model capability**, using each model's **real published modalities** (what the model can actually produce: text, image, embeddings, and so on).

Previously a vendor was counted against **every** capability at once, so any provider in your catalogue appeared to dominate every category simultaneously. That inflated concentration across the board and made the alerts unusable, because everything was always critical.

Now a model is counted once for each capability it genuinely provides, and nothing is inferred from the vendor's name. The result is fewer alerts, each of which points at a real dependency. In the reference account the headline alert is **Stability AI supplying 93% of image models** — a genuine single-vendor exposure on one capability, which is exactly the kind of finding the old calculation buried under noise.

Agents carry no modality data, so they are excluded from the capability view entirely rather than being assigned a capability by guesswork. The separate model and agent breakdowns are unchanged.

## Third-Party Risk Tab Features

- **Concentration Risk Analysis** — Vendor dependency breakdown per capability, from real model modalities
- **Single-Vendor Exposure Alerts** — Critical alerts (>70% concentration), High alerts (>50%)
- **Exit Strategy Tracking** — Monitor portability plans for concentrated vendor dependencies
- **Vendor DDQ Management** — Due diligence questionnaires
- **Contract Tracking** — AI vendor contract monitoring
- **IAM Access Review** — Real third-party IAM permissions audit (\`VendorIAMAccess.tsx\`). IAM roles/policies (\`ListRoles\` / \`GetRole\` with \`RoleLastUsed\`, plus attached and inline policy documents) are correlated with IAM Access Analyzer findings (\`ListAnalyzers\` / \`ListFindingsV2\`, including unused-access). Risk is derived from real signals — external-access findings, wildcard permissions, and stale usage. Live source \`iam+access-analyzer\` (falls back to \`iam\` when Access Analyzer is unreachable), with an honest mock fallback when permissions are missing.

> **Fixed (this wave):** IAM Access Analyzer severity classification now uses the v1 \`ListFindings\` API so the \`isPublic\` flag is available — public external-access findings are correctly classified **HIGH** instead of always MEDIUM.

## AWS Security Posture & Inspector2 Vulnerabilities (NEW)

The Risk **Dashboard** (and the Real-Time Monitoring view) render a live **AWS Security Posture** card (\`risk/SecurityPostureCard.tsx\`) that rolls up GuardDuty, Macie, Inspector, and IAM Access Analyzer, each pulled from its own API with per-source live badges. It now includes an **Inspector2 vulnerability detail** panel backed by \`governSecurityApi.vulnerabilities()\` (\`GET /govern/security/vulnerabilities\`, live source \`inspector2\`): real CVEs on EC2 / ECR images / Lambda with severity tiles (critical / high / medium / low), fix-availability, and covered-resource counts (~100 findings and ~180 covered resources on this account). This complements the existing Inspector "Vulnerabilities" posture dimension with finding-level detail, and shows an honest empty / not-enabled state when Inspector2 is not enabled or not permitted.

**Live Data:** \`governRiskPostureApi\`, \`governIamApi.vendorAccess()\` → \`GET /govern/iam/vendor-access/{vendor_id}\`, \`governSecurityApi.posture()\`, \`governSecurityApi.vulnerabilities()\` → \`GET /govern/security/vulnerabilities\``,
      },
      {
        id: 'govern-safety',
        title: 'AI Safety',
        content: `# AI Safety

Navigate to \`/govern/safety\`.

Capability safety and assurance organized around AWS's 8 Responsible-AI dimensions: Fairness, Explainability, Privacy & Security, Safety, Controllability, Veracity & Robustness, Governance, Transparency.

## Sub-routes

| Route | Description |
|-------|-------------|
| \`/govern/safety/evals\` | Safety evaluations and benchmarks |
| \`/govern/safety/redteam-pipeline\` | Red team testing workflows |
| \`/govern/safety/capabilities\` | Frontier capability thresholds |
| \`/govern/safety/safety-cases\` | Safety case documentation |
| \`/govern/safety/incidents\` | Safety incident management |
| \`/govern/safety/runtime\` | Runtime safety controls |
| \`/govern/threat-modeling\` | MAESTRO threat modeling framework |

## Features

- **Bedrock Guardrails Integration** — Live guardrail metrics and configuration
- **Content Filter Monitoring** — Track blocked content by category
- **PII Detection** — Sensitive data detection rates
- **Hallucination Detection** — Factual accuracy monitoring
- **Bias & Fairness** — Demographic parity and fairness metrics
- **Runtime Safety** — Real-time safety signal monitoring

**Live Data:** \`governGuardrailsApi\`, \`governEvalsApi\`, \`governInvocationSafetyApi\``,
      },
      {
        id: 'govern-shadow-ai',
        title: 'Shadow AI',
        content: `# Shadow AI

Navigate to \`/govern/shadow-ai\`.

Discover unapproved agents, models, tools, and API keys before they become incidents.

## Features

- **Unapproved Agent Detection** — Find agents deployed outside governance
- **Shadow Model Usage** — Track usage of non-sanctioned models
- **API Key Discovery** — Detect hardcoded or leaked API keys
- **Tool Sprawl Analysis** — Monitor proliferation of AI tools
- **Cost Attribution** — Identify shadow AI cost impact

## Detection Methods

- CloudTrail analysis for Bedrock API calls
- Network traffic analysis for external AI APIs
- Code repository scanning for API keys
- IAM policy analysis for overly permissive access

## Token and Cost Figures

Token counts and costs on this page are **measured from Bedrock model invocation records**, priced with each model's own published per-token rate. They are no longer flat per-event estimates applied uniformly to every model.

Two consequences you will see on screen:

- **A model with no published rate shows its cost as unmeasured**, not as zero and not priced using a different model's rate. Borrowing another model's price would produce a confident-looking figure that is simply invented.
- **Where no invocation record matches an identity, its tokens show as unmeasured.** That means "no record matched", not "this person used nothing".

**Prerequisite:** Bedrock **model invocation logging must be enabled** in your account for any token data to exist at all. Without it there is nothing to measure, for any tool, team, or person, and these figures will be unmeasured across the board.

## How Token Costs Are Priced

**Dollar figures come from Cost Explorer; token counts come from CloudWatch. Neither is
derived from the other.** That separation is deliberate. Token counts used to be
back-derived by dividing spend by a list price, which made the resulting "cost per 1K
tokens" arithmetically equal to that list price on every account regardless of what the
account actually spent. Those derived counts have been removed rather than corrected.

Where a rate *is* needed - forecasting, planning, and pricing measured developer-AI
token counts - one shared rate table is used, and **each rate states whether it can be
verified**:

| Provenance | Meaning |
|------------|---------|
| **Verified** | Traced to a named AWS source (the Price List API or an AWS announcement). |
| **Best known** | The best figure available, **not** confirmed by an AWS source. Any number resting on it is an estimate. |

**Why some rates cannot be verified.** Current-generation Anthropic models on Bedrock are
billed through AWS Marketplace, and their rates are not published in machine-readable
form. Across all 11,621 usage types under the \`AmazonBedrock\` service code, the only
Anthropic entries are Claude 2.0, 2.1, 3 Haiku, 3 Sonnet and Instant. Each model card
says "for pricing, see the Amazon Bedrock Pricing page", and that page renders its
per-model tables in the browser. Rather than present a guess as fact, those rates are
marked **Best known** with the reason recorded.

**A model with no rate shows "cost unavailable", never $0.00 and never another model's
rate.** There is deliberately no fallback rate. A fallback is what previously priced
Claude Opus 4.5 and 4.8 at Claude 3 Opus rates - three times too high - and priced Titan
Text Embeddings V2 fifteen times too high while inventing an output rate for a model that
produces no output tokens.

**Cache rates differ by provider and are not derived from a single multiplier.** For
Anthropic models a cache write costs 1.25x the input rate and a cache read 0.10x. For
Amazon Nova, cache writes are **not charged at all** and cache reads are 0.25x. Applying
one ratio across providers would misstate both.

**One caveat on all of this:** list prices are not your prices if you hold committed-use
or private-offer terms. The Cost Explorer dollar figures reflect what you were actually
billed; the rate table does not.

## Prompt Caching: Cached Tokens

The **Token Economics** tab has a dedicated **Prompt Caching** panel showing cache
read and cache write token volume per model, the cache hit rate, and the read-to-write
ratio. All of it is live from the CloudWatch \`AWS/Bedrock\` metrics
\`CacheReadInputTokenCount\` and \`CacheWriteInputTokenCount\`.

**Cache write is shown as prominently as cache read, and is not coloured as a win.**
Cache reads are billed at a steep discount to fresh input, but cache **writes are
billed above** the standard input rate. Caching only pays off when reads
substantially outnumber writes, which is why the panel reports the ratio directly.
Cache write volume was previously computed but never displayed anywhere.

**The cache panel has its own window, and says so.** The rest of the tab uses
month-to-date, because that is what keeps token counts and Cost Explorer dollars
describing the same period - the alignment that makes blended $/1k correct. Cache
activity can fall entirely outside month-to-date, and since that window always starts
on the 1st, such data could never re-enter it. So the cache panel takes its own 7 / 14 /
30-day lookback and states which one it used. **Do not divide the token counts in the
cache panel by the dollars elsewhere on the tab** - they cover different periods.

**"Not measured" is not "no caching".** CloudWatch publishes no cache metric at all for
a model that never requests prompt caching, so an absent metric is an absence of
telemetry, not a measured 0% hit rate. Those models read "not measured" and are
excluded from the fleet totals rather than counted as zero, and the panel discloses how
many of the fleet's models reported cache telemetry at all.

**Cache spend is now a separate line.** Bedrock bills four token dimensions - fresh
input, cache write, cache read, output - but this platform previously folded both cache
dimensions into "input", making cache spend unrecoverable. The Cost Explorer split now
reports all four. In the reference account that revealed cache spend to be the large
majority of input dollars, with cache **write** alone a substantial share of total
Bedrock spend, all of it previously invisible.

**No estimated "cache savings" figure is shown.** A saving is a counterfactual - what
the same workload would have cost with no caching - and nothing available measures it.
The previous card multiplied total spend by a token ratio and applied a hardcoded,
model-agnostic 90% discount. Measured cache spend replaced it.

**Cost Explorer and CloudWatch can legitimately disagree about timing.** Cost Explorer
attributes by billing date, CloudWatch by usage date, and third-party models billed
through AWS Marketplace can land in a later billing period than the usage. Where the
two disagree the panel says so rather than reconciling them silently.

**Live Data:** \`governDeveloperAiApi.usage()\` shadow_ai detection`,
      },
      {
        id: 'govern-developer-ai',
        title: 'Developer AI',
        content: `# Developer AI Usage

Navigate to \`/govern/developer-ai\`.

Monitor developer AI tool consumption (tokens, cost), detect anomalies and shadow usage.

## Features

- **Team-Level Usage** — Aggregate token consumption by team
- **User-Level Breakdown** — Individual developer usage tracking
- **Cost Attribution** — Per-developer and per-team cost analysis
- **Anomaly Detection** — Unusual usage pattern alerts
- **Tool Distribution** — Usage breakdown by AI tool type

## Metrics Tracked

| Metric | Description |
|--------|-------------|
| Tokens In | Input tokens consumed, from invocation records |
| Tokens Out | Output tokens generated, from invocation records |
| Sessions | Number of AI sessions |
| Avg Session Length | Average tokens per session |
| Cost | Cost in USD, priced per model |

## How Tokens and Cost Are Now Calculated

Token counts come from **Bedrock model invocation logs**, and cost is calculated by applying **each model's own published per-token rate** to those counts. Previously both were flat per-event estimates: every invocation was assumed to cost the same regardless of which model served it or how many tokens it moved.

Your totals will therefore differ from what this page reported before. The new figures are measurements; the old ones were multiplications.

Where a value cannot be measured, it is shown as unmeasured rather than estimated:

| Situation | What you see |
|-----------|--------------|
| A model has no published per-token rate | Cost shown as unmeasured. It is **not** priced using another model's rate. |
| No invocation record matches a team or person | Tokens shown as unmeasured — meaning "no record matched", not "used nothing". |

**Prerequisite:** Bedrock **model invocation logging must be enabled** in your AWS account. It is the only source of token counts. If it is off, every figure on this page is unmeasured, and that is the correct answer rather than a broken screen.

**Live Data:** \`governDeveloperAiApi.usage()\` team and user breakdown`,
      },
      {
        id: 'govern-playbook',
        title: 'Governance Playbook',
        content: `# Governance Playbook

Navigate to \`/govern/playbook\`.

Decision framework for autonomous agents with autonomy levels (L0-L4), HITL gates, and A2A trust policies.

## Autonomy Levels

There is **one ladder**, L1 to L4, and these are the names the product actually
renders on every agent badge, drawer and graduation row. This table previously
described a different, five-level L0–L4 ladder with different names
("Human-on-the-Loop", "Human-Delegated"), so a reader comparing the docs against
the Agent Registry saw two ladders that disagreed about the same agent.

| Level | Name | Description | Oversight mode |
|-------|------|-------------|----------------|
| L1 | No Agency | Static responses, no tool use | Human acts on every recommendation |
| L2 | Prescribed Agency | Limited tools, human approval | Agent drafts, human approves per action (in-the-loop) |
| L3 | Supervised | Autonomous within guardrails | Approval drops to exception-only (on-the-loop) |
| L4 | Full Agency | Fully autonomous, self-directed | Post-hoc audit, tamper-proof override (out-of-the-loop) |

Anchored to the AWS Agentic AI Security Scoping Matrix, ISO/IEC 22989 Cl. 5.13,
SAE J3016 and NIST AI RMF oversight subcategories.

**There is no separate "trust tier" scale.** An earlier design added a parallel
T1–T4 trust ladder alongside this one. It was removed before it ever reached the
UI: two four-point scales describing the same agent are ambiguous, and the
collision was concrete — "Supervised" is L3 here, the second *highest* level, but
would have been T2, the second *lowest* trust tier. Its useful mechanics were
folded into the graduation readiness score below instead.

## Readiness: What the Score Means and What It Is Made Of

Every agent on the **Earned Autonomy** board (Agent Registry → Human Oversight →
Earned Autonomy) carries a **Readiness** score, 0–100, higher is better.

**What it means.** How much of the evidence required to reduce human oversight for
that agent is currently satisfied. It measures *evidence*, not the agent's quality,
and it never promotes anything on its own — a human grants every step up the ladder.

**What it is made of.** Eight criteria, weighted by consequence, computed live from
this account's real audit log:

| Criterion | Weight | Blocking | Source |
|-----------|--------|----------|--------|
| Open incidents | 20% | Yes | Real incident records for the agent |
| Active guardrail policy | 20% | Yes | Whether a guardrail is attached |
| Human agreement rate | 18% | Yes | Real approve / reject / escalate / take-over decisions in the audit log |
| Decisions in current scope | 12% | Yes | Count of logged decisions |
| Time at current level | 10% | Yes | Elapsed time since the level was granted |
| Incident rate | 8% | No | Incidents per 1,000 decisions |
| Guardrail intervention rate | 7% | No | Bedrock Guardrails intervention counts |
| Error rate | 5% | No | **No feed exists yet — reported as "not measured"** |

**Weights exist because the criteria are not equally consequential.** Readiness was
previously an unweighted pass count, so "no guardrail policy attached" — a blocking
safety gate — moved the number exactly as much as an advisory rate being slightly
over. An agent could display 86% readiness with a blocking safety gate shut.

**Unmeasured criteria are excluded, not scored as failures.** A criterion that
cannot be evaluated leaves the calculation entirely and is named in the disclosure,
so an operator learns what to switch on. Counting it as a failure would report an
instrumentation gap as an agent behaving badly. Every score therefore also reports
its **coverage** — the share of criterion weight actually evaluated — and no score is
reported below **60%** coverage. Below that, and whenever a *blocking* criterion is
unknown, readiness is **"not scored"** rather than a number, with the reason stated.

**"Not enough evidence" is a distinct verdict** from "Not yet". The first means
nothing is known about the agent; the second means it was assessed and criteria are
unmet. They were previously merged, which rendered "eligible with monitoring" for an
agent with three logged decisions.

**Earning a level requires clearing the bar by a margin; keeping it does not.** A
criterion sitting exactly on its threshold would otherwise flip the verdict between
consecutive reads, reading as instability in the agent rather than in the
measurement. Each row shows the bar as tested, e.g. \`≥ 92% to earn (90% to hold)\`.

**Readiness is not comparable with risk scores.** Both run 0–100, but risk is
higher-is-worse (Critical 75–100) and readiness is higher-is-better. Every rendered
score states its direction; the "How this score works" disclosure on any agent spells
out the definition, method, inputs, coverage, and whether the numbers are live or
illustrative.

## Features

- **Autonomy Level Configuration** — Set levels per agent or agent class
- **HITL Gate Definition** — Configure human approval checkpoints
- **A2A Trust Policies** — Define agent-to-agent delegation rules
- **Escalation Workflows** — Configure when to escalate to humans
- **Override Controls** — Emergency stop and takeover capabilities

**Live Data:** Illustrative (framework guidance)`,
      },
      {
        id: 'govern-multicloud',
        title: 'Multi-Cloud',
        content: `# Multi-Cloud Governance

Navigate to \`/govern/multi-cloud\`.

Unified governance across AWS Bedrock, Azure AI Foundry, Google Vertex AI, and SaaS platforms (ServiceNow, Salesforce, Copilot Studio).

## Tabs

| Tab | Description |
|-----|-------------|
| **Dashboard** | Fleet risk overview, KPIs, emergency controls, posture by provider |
| **Inventory** | Unified agent list with filtering by provider/status |
| **Registry** | Tools, MCP servers, permissions, human oversight, A2A trust |
| **Providers** | Cloud and SaaS provider cards with connector configuration |
| **Analytics** | Cost trends, performance metrics, migration planning |
| **Policies** | Cross-provider policy enforcement and compliance |

---

# Cloud Provider Setup Guides

## Azure Connector Setup

**Prerequisites:**
- Azure subscription with Cost Management Reader access
- Azure AD permissions to create App Registrations

**Step 1: Create App Registration**
1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations
2. Click **New registration**
3. Name: \`AVA-MultiCloud-Connector\`
4. Supported account types: **Single tenant**
5. Click **Register**
6. Note the **Application (client) ID** and **Directory (tenant) ID**

**Step 2: Create Client Secret**
1. In your App Registration, go to **Certificates & secrets**
2. Click **New client secret**
3. Description: \`AVA Connector\`, Expiration: 24 months
4. Click **Add**
5. **Copy the secret value immediately** (it won't be shown again)

**Step 3: Grant Permissions**
1. Go to **Subscriptions** → Select your subscription
2. Click **Access control (IAM)** → **Add role assignment**
3. Role: **Cost Management Reader**
4. Members: Select your App Registration
5. Click **Review + assign**

**Step 4: Configure in AVA**
1. Navigate to \`/govern/multi-cloud?tab=providers\`
2. Click **Configure Azure**
3. Enter: Tenant ID, Client ID, Client Secret, Subscription ID
4. Click **Test Connection** to verify
5. Click **Save Configuration**

**Troubleshooting:**
- "Authentication failed" → Verify Client Secret is correct
- "Subscription access denied" → Check Cost Management Reader role is assigned
- "Token request failed" → Verify Tenant ID and Client ID

---

## GCP Connector Setup

**Prerequisites:**
- GCP Project with billing enabled
- IAM permissions to create service accounts

**Step 1: Create Service Account**
1. Go to [GCP Console](https://console.cloud.google.com) → IAM & Admin → Service Accounts
2. Click **Create Service Account**
3. Name: \`ava-multicloud-connector\`
4. Click **Create and Continue**

**Step 2: Grant Roles**
1. Add roles:
   - **BigQuery Data Viewer** (for billing export)
   - **Vertex AI User** (for agent inventory)
   - **Viewer** (for project access)
2. Click **Continue** → **Done**

**Step 3: Create JSON Key**
1. Click on your new service account
2. Go to **Keys** tab → **Add Key** → **Create new key**
3. Key type: **JSON**
4. Click **Create** (key file downloads automatically)

**Step 4: Enable BigQuery Billing Export (Optional)**
1. Go to **Billing** → **Billing export**
2. Click **Edit settings** under BigQuery export
3. Select a dataset or create new
4. Note the table name: \`project.dataset.gcp_billing_export_v1_XXXXXX\`

**Step 5: Configure in AVA**
1. Navigate to \`/govern/multi-cloud?tab=providers\`
2. Click **Configure GCP**
3. Enter: Project ID, paste entire JSON key contents
4. Optionally enter BigQuery billing export table
5. Click **Test Connection** to verify
6. Click **Save Configuration**

**Troubleshooting:**
- "Invalid service account JSON" → Ensure you pasted the complete JSON file
- "Permission denied" → Verify Viewer role is assigned
- "BigQuery access failed" → Check BigQuery Data Viewer role

---

# SaaS Platform Setup Guides

## ServiceNow Connector Setup

**Prerequisites:**
- ServiceNow instance (developer or enterprise)
- Admin access to create OAuth applications

**Step 1: Create OAuth Application**
1. Log into your ServiceNow instance
2. Navigate to **System OAuth** → **Application Registry**
3. Click **New** → **Create an OAuth API endpoint for external clients**
4. Name: \`AVA Multi-Cloud Connector\`
5. Client ID will be auto-generated
6. Set **Active** to true
7. Click **Submit**

**Step 2: Configure OAuth Scopes**
1. Open your OAuth application
2. Under **OAuth Scopes**, add:
   - \`useraccount\`
   - \`openid\`
3. If using AI Agent Studio, also add any required AI scopes

**Step 3: Get Client Credentials**
1. Note your **Client ID** from the application
2. Generate a **Client Secret** (keep this secure)
3. Note your **Instance URL** (e.g., \`https://dev12345.service-now.com\`)

**Step 4: Configure in AVA**
1. Navigate to \`/govern/multi-cloud?tab=providers\`
2. Click **Configure ServiceNow**
3. Enter: Instance URL, Client ID, Client Secret
4. Enter monthly license cost for cost tracking
5. Click **Test Connection** to verify
6. Click **Save Configuration**

**Troubleshooting:**
- "Authentication failed" → Verify Client ID/Secret match
- "API access denied" → Check OAuth scopes are configured
- "Instance unreachable" → Verify Instance URL format

---

## Salesforce Connector Setup

**Prerequisites:**
- Salesforce org (Developer, Enterprise, or Unlimited edition)
- System Administrator profile or Setup access

**Step 1: Create Connected App**
1. Go to **Setup** → **App Manager** → **New Connected App**
2. Connected App Name: \`AVA Multi-Cloud Connector\`
3. Enable **Enable OAuth Settings**
4. Callback URL: \`https://localhost/callback\` (not used for client credentials)

**Step 2: Configure OAuth Scopes**
1. Add OAuth Scopes:
   - **Access and manage your data (api)**
   - **Perform requests on your behalf at any time (refresh_token, offline_access)**
2. Enable **Enable Client Credentials Flow**
3. Click **Save**

**Step 3: Configure Client Credentials**
1. After saving, go to **Manage** on your Connected App
2. Click **Edit Policies**
3. Under **Client Credentials Flow**, select a **Run As** user (must have API access)
4. Click **Save**

**Step 4: Get Consumer Credentials**
1. On the Connected App page, click **Manage Consumer Details**
2. Verify your identity
3. Note the **Consumer Key** (Client ID) and **Consumer Secret**

**Step 5: Configure in AVA**
1. Navigate to \`/govern/multi-cloud?tab=providers\`
2. Click **Configure Salesforce**
3. Enter: Client ID (Consumer Key), Client Secret (Consumer Secret)
4. Select Login URL (Production or Sandbox)
5. Enter monthly license cost for cost tracking
6. Click **Test Connection** to verify
7. Click **Save Configuration**

**Troubleshooting:**
- "Authentication failed" → Verify Consumer Key/Secret
- "invalid_grant" → Enable Client Credentials Flow in Connected App
- "API access denied" → Check Run As user has API permissions

---

## Copilot Studio Connector Setup

**Prerequisites:**
- Microsoft 365 tenant with Power Platform
- Power Platform Admin or Environment Admin role

**Step 1: Create Azure AD App (or reuse Azure connector)**
1. If you already configured Azure connector, you can reuse those credentials
2. Otherwise, follow Azure App Registration steps above
3. Add API permission: **Power Platform API** → \`user_impersonation\`

**Step 2: Get Environment ID**
1. Go to [Power Platform Admin Center](https://admin.powerplatform.microsoft.com)
2. Select **Environments**
3. Click on your target environment
4. Note the **Environment ID** from the URL or details page

**Step 3: Grant Power Platform Permissions**
1. In Power Platform Admin Center, go to your environment
2. Click **Settings** → **Users + permissions** → **Users**
3. Add your App Registration as a user with **System Administrator** role

**Step 4: Configure in AVA**
1. Navigate to \`/govern/multi-cloud?tab=providers\`
2. Click **Configure Copilot Studio**
3. Enter: Tenant ID, Client ID, Client Secret, Environment ID
4. Enter monthly capacity cost for cost tracking
5. Click **Test Connection** to verify
6. Click **Save Configuration**

**Troubleshooting:**
- "Authentication failed" → Verify Azure AD credentials
- "Permission denied" → Grant Power Platform Admin role
- "Environment not found" → Check Environment ID format

---

## Testing Connections

All connectors support the **Test Connection** feature:
1. Enter credentials in the configuration modal
2. Click **Test Connection**
3. Results show:
   - Success/failure status
   - Detailed error message if failed
   - Response latency in milliseconds

Use Test Connection before saving to validate credentials.

---

## Credential Storage

All credentials are stored in **AWS Secrets Manager**:

| Secret Name | Provider | Fields |
|-------------|----------|--------|
| \`ava/connectors/azure\` | Azure | tenant_id, client_id, client_secret, subscription_id |
| \`ava/connectors/gcp\` | GCP | project_id, service_account_json, billing_export_table |
| \`ava/connectors/servicenow\` | ServiceNow | instance_url, client_id, client_secret, monthly_license_cost |
| \`ava/connectors/salesforce\` | Salesforce | client_id, client_secret, login_url, monthly_license_cost |
| \`ava/connectors/copilot-studio\` | Copilot Studio | tenant_id, client_id, client_secret, environment_id, monthly_capacity_cost |

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/api/v1/govern/multicloud/status\` | GET | Status of all connectors |
| \`/api/v1/govern/multicloud/costs\` | GET | Costs from all providers |
| \`/api/v1/govern/multicloud/agents\` | GET | Agents from all providers |
| \`/api/v1/govern/multicloud/test-connection/{provider}\` | POST | Test a connector |
| \`/api/v1/govern/multicloud/configure/{provider}\` | POST | Configure a connector |
| \`/api/v1/govern/multicloud/configure/{provider}\` | DELETE | Remove a connector |

**Live Data:** \`multicloudApi.status()\`, \`multicloudApi.allCosts()\`, \`multicloudApi.allAgents()\`, \`multicloudApi.testConnection()\``,
      },
      {
        id: 'govern-dev-tools',
        title: 'Agentic Coding',
        content: `# Agentic Coding

Navigate to \`/govern/dev-tools\`.

Governance for AI-powered coding assistants (Claude Code, Kiro, Copilot, Cursor).

## Features

- **API Routing Compliance** — Track which APIs coding assistants access
- **Code Context Exposure** — Monitor what code is sent to AI providers
- **Shadow Usage Detection** — Find unapproved coding assistant usage
- **Tool-Specific Policies** — Configure rules per assistant type
- **Harness Governance** — Kill-switch, tool tiers, validation panels
- **Path Jailing** — Block access to sensitive paths

## AI Tool Provenance (Detection tab)

Two questions per observed caller, answered from evidence only — never from a default.

**Where did the call go?**

| Value | How it is earned |
|-------|------------------|
| **Bedrock** | A CloudTrail Bedrock event. In-account, logged, guardrail-eligible |
| **Vendor API** | A DNS or proxy record matching a provider domain (\`api.anthropic.com\`, \`api.openai.com\`, …) |
| **Unknown path** | Neither. Unmeasured — **not** a violation |

**How did the tool get onto its host?**

| Value | How it is earned |
|-------|------------------|
| **Managed** | Host is under endpoint management and, where package inventory exists, the tool is in it |
| **AWS runtime** | A serverless execution environment (Lambda, Fargate, AgentCore) — AWS provisions it from a deployment package, so there is no endpoint to enrol |
| **Self-installed** | The host's inventory **was read** and this tool is absent from it |
| **Unseen host** | The call came from a host with no endpoint coverage. Deliberately not "self-installed" — "we cannot see this host" is a different fact, and usually the more important one |

### The most important thing to know before reading the numbers

**"Vendor API: 0" does not mean nobody bypassed Bedrock.** Detecting a vendor call requires
Route 53 Resolver query logging. Without it a tool calling \`api.anthropic.com\` produces **no
record at all** — it is missing from these counts entirely, not counted as unknown. The panel
shows how many of your VPCs have that logging, and says this in plain language above the findings.

Every count therefore ships with its coverage denominator: managed hosts over known hosts, VPCs
with DNS logging over VPCs, calls classified over calls observed, and hosts with package inventory
over managed hosts. Where a denominator is zero you will see **"no denominator"** rather than 0% —
a failing control and nothing to control are opposite readings and should not look alike.

One denominator deserves particular care. The endpoint percentage counts **EC2 instances**, and
developer machines are not EC2. So "100%" can appear beside a caller marked *unseen host*; when
that happens the panel says so explicitly rather than letting the percentage speak for itself.

**Out of scope, stated rather than implied:** none of this sees a developer laptop off the corporate
network. That needs an endpoint agent or MDM; cloud telemetry cannot answer it.

Each row exposes an **Evidence** view naming exactly what earned every classification — the
CloudTrail event source, the user-agent token, how the host was or was not attributed.

## Sub-routes

| Route | Description |
|-------|-------------|
| \`/govern/path-jail\` | Path Jailing Rule Editor — manage blocked paths |
| \`/govern/policy-drift\` | Policy-Reality Drift Dashboard — detect violations |

**Live Data:** \`governDeveloperAiApi.usage()\`, \`governDeveloperAiApi.aiToolProvenance()\` (CloudTrail + SSM inventory + EC2/Route 53 coverage), \`governPathJailApi\`, \`governPolicyDriftApi\``,
      },
      {
        id: 'govern-path-jail',
        title: 'Path Jailing',
        content: `# Path Jailing Rule Editor

Navigate to \`/govern/path-jail\`.

Manage path access rules for AI coding assistants. Block access to sensitive files and directories.

## Features

- **18 Default Blocked Patterns** — Pre-configured rules for secrets, .env, credentials, SSH keys, AWS config
- **Custom Rule Creation** — Add rules with glob, regex, or exact match patterns
- **Enable/Disable Rules** — Toggle rules without deletion
- **Pattern Testing Tool** — Check if a path would be blocked
- **Recent Violations Panel** — View last 10 blocked access attempts
- **Harness-Specific Overrides** — Different rules per tool type (Claude Code, Copilot, etc.)

## Default Blocked Patterns

| Pattern | Type | Description |
|---------|------|-------------|
| \`**/.env*\` | Glob | Environment files |
| \`**/credentials*\` | Glob | Credential files |
| \`**/.aws/**\` | Glob | AWS configuration |
| \`**/.ssh/**\` | Glob | SSH keys |
| \`**/secrets/**\` | Glob | Secrets directories |

**Live Data:** Backend rule store, violation audit log`,
      },
      {
        id: 'govern-policy-drift',
        title: 'Policy Drift',
        content: `# Policy-Reality Drift Dashboard

Navigate to \`/govern/policy-drift\`.

Detect when actual AI assistant behavior deviates from declared governance policies.

## Features

- **Drift KPIs** — Total findings, compliance gap %, worst offender, time since last analysis
- **Drift-by-Type Visualization** — Donut chart showing TIER_VIOLATION, PATH_VIOLATION, UNKNOWN_HARNESS
- **Findings Table** — Sortable/filterable with CloudTrail evidence links
- **Bulk Resolve** — Remediate multiple drift findings at once
- **Worst Offenders Panel** — Top 5 users/harnesses by drift count
- **7-Day Trend Chart** — New findings vs resolved over time
- **Policy Comparison View** — Expected vs actual behavior diff

## Drift Types

There are **three** drift categories. Each one compares a declared policy against a real observed event.

| Type | Description |
|------|-------------|
| TIER_VIOLATION | Tool used above its approved tier |
| PATH_VIOLATION | Blocked path was accessed |
| UNKNOWN_HARNESS | Unregistered AI tool detected |

## Removed: Approval Bypass

A fourth category, **Approval Bypass**, has been **removed** from the donut chart, the legend, and the findings filters.

It never detected anything, and it never could have. Detecting a bypassed approval requires an approval signal to compare behaviour against — a record of what was approved, by whom, and when. The platform has no such signal, so the category sat permanently at zero.

A drift category that always reads zero is worse than no category at all, because a governance reader interprets it as "we checked for approval bypasses and found none". Nothing was ever being checked. Removing the category is the honest presentation; if you previously saw four segments and now see three, that is the change.

The three remaining categories are unchanged in both definition and behaviour.

**Live Data:** AWS CloudTrail, policy store`,
      },
      {
        id: 'govern-trust-stack',
        title: 'Trust Stack',
        content: `# Trust Stack

Navigate to \`/govern/trust-stack\`.

Visualizes the 3-layer governance architecture that provides defense-in-depth for AI systems.

## Layers

| Layer | Purpose | Key Controls |
|-------|---------|--------------|
| **Content Safety** | What can the AI say? | Bedrock Guardrails, content filters, PII redaction |
| **Access Control** | Who can do what? | Cedar policies, AVP, IAM, HITL gates |
| **Audit & Observability** | What happened? | CloudTrail, X-Ray, Langfuse, CloudWatch |

## Features

- **Interactive Layer Exploration** — Click to expand each layer
- **AWS Service Mapping** — See which AWS services implement each control
- **3 Lines of Defense View** — First line (operations), second line (risk/compliance), third line (audit)
- **Control Coverage Visualization** — Track implementation status
- **Export Capability** — Generate trust architecture documentation

**Live Data:** AWS Config compliance status`,
      },
      {
        id: 'govern-operations',
        title: 'Operations',
        content: `# Operations

Navigate to \`/govern/operations\`. **Add-on**

AIOps control room for the agent fleet. Tabs are grouped into **Ops** (Overview, Fleet Health, Incidents, On-Call, Changes, Alerts, SLAs, Runbooks, Traces (X-Ray), Capacity) and **GRC** (Compliance, Evidence, Metrics).

## Live Data Sources

- \`governOperationsApi.fleetStatus()\` — fleet health (healthy / degraded / down, availability %) on the Overview and Fleet Health tabs
- \`governOperationsApi.activeAlerts()\` — firing alerts mapped from CloudWatch Alarms (\`describe_alarms\` in ALARM state) on the Overview and Alerts tabs
- \`governOperationsApi.opsMetrics()\` — operational metrics including MTTR and availability on the Overview tab
- \`governCapacityApi.quotas()\` / \`.alerts()\` — AWS Service Quotas usage and capacity-breach alerts on the Capacity tab
- \`governOperationsApi.ssmManagedInstances()\` / \`.ssmRunbooks()\` / \`.ssmCommandHistory()\` — AWS Systems Manager Fleet Manager (read-only) on the Runbooks tab
- \`governXRayApi.getServiceGraph()\` / \`.getTraceSummaries()\` / \`.getTraceDetails()\` — live AWS X-Ray service map, recent trace summaries, and per-trace segment detail on the Traces (X-Ray) tab

## Traces (X-Ray) Service Map (NEW)

The **Traces (X-Ray)** tab (\`operations/ServiceMap.tsx\`) renders two live X-Ray views backed by \`governXRayApi\`:

- **Service graph** (\`GET /govern/xray/service-graph\`) — each node's name, type, average response time, error rate, and throughput, plus its downstream dependency edges.
- **Trace summaries** (\`GET /govern/xray/traces\`) — a table of recent traces (id, duration, HTTP method/status, fault/error/throttle/partial flags, service count). Clicking a row loads \`GET /govern/xray/traces/detail\` into a side drawer that renders the segment timing tree as a lightweight Gantt.

Badges gate on the graph/trace \`.live\` flags; a live-but-empty window shows an honest empty state ("X-Ray tracing may not be enabled on these services") rather than fabricating numbers.

## Systems Manager Fleet Manager (Read-Only)

The **Runbooks** tab includes a **Systems Manager Fleet Manager** section (\`operations/RunbookCenter.tsx\`) backed by three read-only SSM endpoints (live source \`ssm\`):

- \`GET /govern/operations/ssm/managed-instances\` — managed instances (\`describe_instance_information\`)
- \`GET /govern/operations/ssm/runbooks\` — document / runbook catalog (\`list_documents\`)
- \`GET /govern/operations/ssm/command-history\` — command history (\`list_commands\`)

Execution is intentionally **not** wired: no \`SendCommand\` or \`StartAutomationExecution\` is ever issued, and the per-document Run control is disabled with the honest label "Read-only - execution not enabled in this build."

## Mean Time to Detect (MTTD) — Not Measured

The **MTTD** tile on the Metrics tab now reads **"Not Measured"**. It previously showed a value with a green "Excellent" rating.

That rating was wrong. Nothing in this platform records when an incident was **detected**. The incident timeline captures when an incident was **acknowledged** and when it was **resolved**, which is what mean time to resolve (MTTR) is built from — but detection is the step before acknowledgement, and there was no source for it. The tile was reporting an absent value as a fast one, and because low detection time is good, the absence rendered as green.

Consequences on screen:

- The MTTD tile shows "Not Measured" with a short note naming the missing source, and is excluded from the live badge.
- The DORA performance summary underneath now cites only MTTR and change failure rate, and states explicitly that MTTD is excluded. It no longer folds an unmeasured metric into an overall performance claim.

**What would make it real:** a CloudWatch alarm that actually covers your AI workloads — Bedrock and AgentCore. An alarm transition is the detection event MTTD would be measured from. In the reference account there are **85 CloudWatch alarms and none of them cover AI services**, so no detection event exists to measure. Adding alarm coverage over your AI workloads is the prerequisite; until then, "Not Measured" is the accurate reading.

MTTR, change failure rate, and availability are unaffected and remain measured.

## Data Provenance

Each surface renders a \`Live\` badge only when its own payload reports \`live: true\`; otherwise it shows illustrative data under a \`Mock\` badge.

The **Incidents** tab is now backed by a real store. It reads the control-plane Operations table (\`fsi-control-plane-govern-operations\`, whose home region resolves through \`table_region("GOVERN_OPERATIONS")\`) and reports \`live: true\` with \`source: dynamodb\`. In the reference account it currently returns **0 incidents** with the note "No incidents recorded in the Operations store." **That zero is a measurement, not a gap** — the store was reachable and had nothing in it — so it renders as \`0\` under a \`Live\` badge rather than as \`—\`. The tab previously read a table name that had never been provisioned in any region.

Alert **rules** and alert mutations (acknowledge / silence / create), plus the **On-Call** and **SLA** tabs, still report \`source: memory\` and remain mock. \`source: memory\` is the signal to look for: it means nothing persistent answered, which is how a broken store is told apart from an empty one. Active alerts are separate and live from CloudWatch (\`source: cloudwatch\`).

A tile showing \`—\` on this page is a third state, distinct from both: it means the platform could not measure that value at all. See **How to Read the Numbers**.`,
      },
      {
        id: 'govern-reports',
        title: 'Reports',
        content: `# Reports

Navigate to \`/govern/reports\`. **Add-on**

Board-ready governance reporting that aggregates live evidence from across the platform.

## Live Data Sources

- **Landing summary** (\`useReportsDataSummary\`) — a live cross-source roll-up counting live agents, guardrails, average compliance, and findings across AgentCore, Guardrails, Deployments, Compliance, Security, Risk, and Fleet. The badge reports how many of those sources are actually live (e.g. "5/7 live sources").
- **Agent Resource Inventory** tab (\`useAgentResourceData\`) — per-agent resource inventory joined from \`governAgentCoreApi.agents()\` (Bedrock / AgentCore discovery), \`governGuardrailsApi.telemetry()\`, and \`deploymentsApi.list()\`.
- **Framework Compliance** tab (\`useFrameworkCompliance\`) — per-framework control coverage from \`complianceApi.getPosture()\`.

## Data Provenance

Each source is badged live or mock per payload; sources that error or return nothing degrade to an honest empty state rather than fabricated values.`,
      },
    ],
  },
  {
    id: 'observability',
    title: 'Operate',
    children: [
      {
        id: 'operate-deployments',
        title: 'Deployments',
        content: `# Deployments

Navigate to \`/operate/deployments\`.

Every CodeBuild + Step Functions + Terraform/CDK/CloudFormation run kicked off from AVA lands in this queue — FSI Foundry use cases, Reference Implementations, App Templates, AaaS Frontier Agents, Harness redeploys.

## What each row shows

- Deployment ID (UUID) + human-readable name
- Template ID / IaC type (\`terraform\`, \`cdk\`, \`cloudformation\`, or \`bash\`)
- Status (pending / packaged / validating / deploying / **deployed** / **failed**)
- Build ID (deep-links into the CodeBuild console with the tab pre-scrolled to the log)
- Duration, region, target account
- Failed stage (when applicable) + short reason

## The state machine

\`pending → packaged → delivered → validating → packaging → deploying → deployed | failed\`

Each transition is written to \`ava-cp-<id>-deployments\` under the same DynamoDB row (\`status_history\` list). The row is the source of truth — the UI just polls it.

## Deploy from Git vs. Deploy from S3

- **Quick Deploy** (default) — the SPA uploads a zipped template to \`s3://<state-bucket>/deployments/<id>/\` and the CodeBuild picks it up.
- **Deploy from Git** — the CodeCommit mirror is used as the source; the deployment record stores the branch / commit SHA. Requires the one-time \`seed-codecommit.sh init\` step from Getting Started.

## Retry / Redeploy / Destroy

Every failed row has a Retry button that re-launches the Step Function under the same deployment ID (so history stays contiguous). Successful rows expose Redeploy (fresh Step Function) and Destroy (calls the template's \`destroy.sh\` or \`terraform destroy\`).

## Streamed logs

The row detail drawer streams CodeBuild logs live via SSE. Log lines get syntax-highlighted for Terraform / CDK output; \`ERROR:\` and \`CREATE_FAILED\` are surfaced as pinned events at the top of the log so you don't have to scroll a 4 000-line trace.`,
      },
      {
        id: 'operate-prompt-optimization',
        title: 'Prompt Optimization',
        content: `# Prompt Optimization

Navigate to \`/operate/prompt-optimization\`.

Runs Bedrock **Advanced Prompt Optimization** end-to-end from the UI. Give it a seed prompt and a small labeled dataset; it comes back with scored variants and a one-click promotion into your Harness.

## Flow

1. **Seed** — paste (or point at) a system prompt and pick a target model. The optimizer inherits your Harness's tools + guardrails so the variants are scored against the same runtime.
2. **Labeled examples** — upload a JSONL file of \`{input, expected}\` pairs (5–200 rows).
3. **Rubric** — pick a scoring rubric (accuracy, groundedness, style, custom) or write your own scoring function.
4. **Run** — Bedrock generates 5–15 variants, scores each against your dataset, and returns a ranked list. The run's trace ends up in Langfuse for reproducibility.
5. **Promote** — the winner (or any variant) can be promoted with one click; the target Harness's system-prompt field is updated and the previous prompt is kept in the harness version history.

## Where the runs live

Every optimization run writes a row to \`ava-cp-<id>-deployments\` with template \`prompt-optimization\` and a special \`outputs.variants\` payload. Failed runs surface the actual Bedrock error message (not a generic 500).`,
      },
      {
        id: 'operate-evaluation',
        title: 'Evaluation',
        content: `# Evaluation

Navigate to \`/operate/evaluation\`.

The Evaluation surface is an **LLM-as-judge** engine — build suites of test cases, run them against any deployed agent, and score each run on quality dimensions (coherence, grounding, honesty, safety) with promotion gates.

## Sub-pages

| Route | Purpose |
|---|---|
| \`/operate/evaluation\` | Fleet view — every suite with pass rate, last-run timestamp, and current promotion gate status |
| \`/operate/evaluation/suites/<id>\` | Suite Builder — add / edit / import test cases, pick the judge model, wire the scoring rubric |
| \`/operate/evaluation/runs/<id>\` | Run Detail — per-case verdict, judge chain-of-thought, cost, latency, failure attribution |
| \`/operate/evaluation/compare\` | A/B Compare — pairwise battle between two agent versions or two deployments with side-by-side + calibration |

## Suite structure

- \`suite_id\`, \`name\`, \`description\`
- Cases — \`{input, expected_output?, metadata}\` rows; each case declares which quality dimensions apply
- Judge — model + system prompt + rubric (0–5 or pass/fail per dimension)
- Gates — \`pass_threshold\`, \`fail_threshold\`, \`min_cases_passed\`; a gate result becomes the promotion signal downstream

## Judge behaviour

- **Streamed responses** are stitched before judging — an agent that streams SSE tokens is scored on the full completion, not per-chunk (fixed in a recent regression that cratered coherence/grounding scores for streaming agents).
- **Failed runs** report the actual error (timeout, guardrail block, tool exception) rather than defaulting to 0/0 verdict.
- **Pairwise compare** does bias-controlled calibration — a "control" pair is scored first and its verdict is used to correct order-bias in the real comparisons.

## Auto-enrollment

Every new deployment scaffolds a **draft suite** in the background — mapping the deployment record (Foundry, reference impl, AgentCore Runtime, or web app) into a template of representative cases pulled from the app's own README, sample data, or registry. The suite is created in \`DRAFT\` state; the *first* run stays a human decision so a naïve run doesn't blast Bedrock spend.

Enrollment supports all three deployment-record schemas (including the \`agentcore_runtime_arn\` alias) and strips the \`foundry-\` prefix when matching against the registry.

## Storage

All suites and runs live in \`ava-cp-<id>-evaluations\` (partition-keyed with \`SUITE#\`, \`RUN#\`, \`PAIRWISE#\` prefixes). The IAM policy on the backend ECS task-role grants \`bedrock:InvokeModel\` and \`bedrock-agentcore:*Invoke*\` so judge and target both run.`,
      },
      {
        id: 'operate-approval-queue',
        title: 'Approval Queue',
        content: `# Approval Queue

Navigate to \`/operate/approvals\`.

Live inbox of pending HITL sign-offs produced by the Approval Policy Engine. Each row shows requester, target resource, action, matched policy, and time remaining.

## Row fields

- **Requester** — the AVA user or ECS service that triggered the request
- **Resource** — the record kind + id being changed (deep-links to the record's Registry detail page)
- **Action** — \`register\` / \`deploy\` / \`delete\` / \`promote\`
- **Matched policy** — the policy that flagged the request; hover to see all fields
- **SLA countdown** — hours remaining before the request is flagged as stale (per the policy's \`sla_hours\`)
- **Approver quorum** — signatures collected vs. required

## Actions

- **Approve** / **Deny** per row (writes a decision to \`ava-cp-<id>-approval-requests\`).
- **Bulk approve / Bulk deny** — select up to 200 rows and act on them in one request; the backend \`batch-approve\`/\`batch-deny\` endpoint cap is 200.
- **Cancel** — the original requester can cancel their own pending request until it's decided.

## Downstream effects

Every approval decision fires a hook that flips the linked resource's registry state:

- Draft record has been submitted for approval, currently \`PENDING_APPROVAL\` → \`APPROVED\` (or the record is rejected and remains \`DRAFT\`).
- Lifecycle-safe fallback: if the record is stuck in \`CREATING\` at the time of approval, the hook waits it out then resubmits, so an approval never silently drops.
- Identity Providers are stored in DynamoDB directly; their approvals flip an \`approved\` flag on the row.

## Where the requests come from

Reads \`ava-cp-<id>-approval-requests\`; every route that enforces an Approval Policy writes here (see Secure → Approval Policies for the policy shape).`,
      },
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
| Agent Safety Controls | Platform & Governance | ECS + CloudFront + Cognito + DynamoDB + Lambda | Available |`,
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
          {
            id: 'govern-compliance-agent',
            title: 'Govern Compliance Agent (R07)',
            children: [
              {
                id: 'govern-compliance-agent-business',
                title: 'Business & Agent Design',
                content: `# Govern Compliance Agent (R07) -- Business & Agent Design

Self-governing compliance agent that continuously audits **AgentCore deployments, AWS security posture, and model governance**, detects policy violations, and can take remediation actions on the control plane -- all within an autonomy contract that keeps humans in the loop for high-impact changes.

Source: [\`applications/fsi_foundry/use_cases/govern_compliance_agent/\`](https://github.com/aws-samples/sample-agentic-value-accelerator/tree/main/applications/fsi_foundry/use_cases/govern_compliance_agent)

## Why it exists

The Govern pillar (Compliance Center, Risk Management, Model Management, Trust Stack) surfaces posture, drift, and violations across the fleet. The Compliance Agent closes the loop by acting on that signal -- for the actions where autonomous remediation is safe -- and by routing everything else through the Approval Queue.

## Sub-Agent Design (Supervisor + 4 Specialists)

| Sub-agent | Responsibilities | Sample tools |
|-----------|------------------|--------------|
| **Policy Auditor** | Audit AgentCore Cedar policies + Approval Policies for coverage gaps, permissive rules, missing guardrails | \`policy_engine.list\`, \`policies.audit\`, \`guardrails.check_attached\` |
| **Security Scanner** | Query AWS Security Hub / GuardDuty / Access Analyzer / Inspector; correlate findings to agents and runtimes | \`securityhub.get_findings\`, \`guardduty.list_findings\`, \`access_analyzer.list_findings\` |
| **Drift Detector** | Compare deployed configs to golden state -- IAM policy drift, guardrail detachment, unpublished registry records | \`agent_registry.list\`, \`iam.compare\`, \`guardrail_state.diff\` |
| **Remediation Planner** | Synthesize an ordered plan of control-plane actions with per-step blast radius and rollback | \`control_plane.plan\`, \`approval_engine.evaluate\`, \`registry.set_status\` |

The **Supervisor** coordinates the four, decides which findings warrant action, and consults the Approval Policy Engine before any control-plane write.

## Framework Parity

- **LangGraph** implementation at \`src/langchain_langgraph/\` -- stateful graph with named nodes per sub-agent
- **Strands** implementation at \`src/strands/\` -- feature-parity agent + tool set

Both hit the same AgentCore runtime, the same tool schemas, and the same control-plane REST endpoints. Deploy either from **Build → Applications → FSI Foundry**.`,
              },
              {
                id: 'govern-compliance-agent-architecture',
                title: 'Architecture & Autonomy Model',
                content: `# Govern Compliance Agent (R07) -- Architecture & Autonomy Model

## Tool Categories

Under \`src/langchain_langgraph/tools/\`:

| Module | Purpose |
|--------|---------|
| **\`agentcore_tools.py\`** | AgentCore control-plane reads -- list agents / runtimes / gateways / memory stores |
| **\`guardrail_tools.py\`** | Bedrock Guardrails inventory + attachment probes |
| **\`enforcement_tools.py\`** | Cedar policy engine + Approval Policy Engine reads and writes |
| **\`control_plane_tools.py\`** | Registry status transitions, approval requests, deployment writes |
| **\`security_tools.py\`** | Security Hub / GuardDuty / Access Analyzer / Inspector aggregation |

## Autonomy-Gated Approval

Every control-plane write goes through an **autonomy tier** check before executing:

| Autonomy | Meaning | Behaviour |
|----------|---------|-----------|
| **L1 -- Observe** | Read-only | No writes; findings only |
| **L2 -- Auto** | Low-blast-radius fixes | Executes without human approval; audit-logged |
| **L3 -- HITL** | Medium risk | Routed through the Approval Queue; waits for OPERATOR sign-off |
| **L4 -- Break-glass** | High-blast-radius | Routed to ADMIN with quorum + SLA |

L3+ actions land as rows in **Operate → Approval Queue** with the matched policy, requester, SLA countdown, and target resource. Denying a row rolls back the plan.

## AWS Integration Points

- **AgentCore Runtime + AgentCore Gateways** -- host for the four sub-agents and target for their reads
- **Bedrock Guardrails** -- attached to every sub-agent by default (FSI Standard preset)
- **Approval Policy Engine** (\`backend/src/services/approval_policy_engine.py\`) -- gates every write
- **AWS Agent Registry** (AVA namespace) -- auto-publish on successful deploy via the existing \`deployment_success_hook\` Lambda
- **CloudTrail + Config + Security Hub** -- read paths for the Security Scanner
- **DynamoDB** -- \`approval_requests\` / \`approval_policies\` / \`deployments\` tables for state
- **Langfuse + AgentCore Observability** -- both wired at deploy time

## Related Govern Surfaces

- **Compliance Center** (\`/govern/compliance\`) -- 14 frameworks / 281 controls; the agent's Policy Auditor tags findings against them
- **Risk Management** (\`/govern/risk\`) -- OWASP Agentic Top 10 mapping; the agent's Security Scanner surfaces these
- **Red-Team Test Pipeline → Production Feedback** -- real-time guardrail block incidents; the agent can create tests from them
- **Model Management → Model Lineage / Provenance** -- live SageMaker ML Lineage graph (\`GET /govern/sagemaker/lineage\`); the earlier fabricated ML-SBOM differential-privacy fields (DP-SGD / PATE / epsilon-delta) have been removed`,
              },
              {
                id: 'govern-compliance-agent-deployment',
                title: 'Deployment',
                content: `# Govern Compliance Agent (R07) -- Deployment

## From the Control Plane UI

1. Navigate to **Build → Applications → FSI Foundry**
2. Locate the **Govern Compliance Agent (R07)** card under **Risk & Compliance**
3. Choose the framework: **LangGraph** or **Strands** (both are supported)
4. Optionally opt-in to **AgentCore Observability**
5. Click **Deploy** -- the same CodeBuild + Step Functions pipeline as every other Foundry use case runs; the deployment appears in **Operate → Deployments**
6. On success, the auto-publish hook writes an **AGENT** record into the AVA namespace on AWS Agent Registry (\`recordType=AGENT\`, \`Kind=agent\`, tag \`Source=foundry-deploy\`)

## Direct AgentCore SDK Invocation

For scripting / CI use cases, the package ships a CLI:

\`\`\`bash
python3 applications/fsi_foundry/use_cases/govern_compliance_agent/invoke_agentcore.py \\\\
  --runtime-arn arn:aws:bedrock-agentcore:us-east-1:<account>:runtime/<runtime-id> \\\\
  --qualifier DEFAULT \\\\
  --input '{"scope": "fleet", "modules": ["policy", "security", "drift"]}'
\`\`\`

The CLI wraps \`bedrock-agentcore invoke-agent-runtime\` with structured input / output.

## Runtime Configuration

Environment variables the runtime reads (set at deploy time):

| Variable | Purpose |
|----------|---------|
| \`AUTONOMY_LEVEL\` | \`L1\` / \`L2\` / \`L3\` / \`L4\` -- see the [architecture tab](#govern-compliance-agent-architecture) |
| \`APPROVAL_POLICY_ENGINE_URL\` | Control-plane endpoint the agent consults before writes |
| \`AGENT_REGISTRY_ID\` | AVA registry the auto-publish hook targets on deploy |
| \`GUARDRAIL_ID\` / \`GUARDRAIL_VERSION\` | Attached Bedrock Guardrails |
| \`LITELLM_BASE_URL\` | LLM Gateway proxy so all model calls are governed |

## Testing

1. **Local invocation** -- \`invoke_agentcore.py --input '{"scope":"single","target":"<agent-id>"}'\`
2. **Approval Queue** -- flip \`AUTONOMY_LEVEL\` to \`L3\` and trigger a remediation action; the row appears in **Operate → Approval Queue**
3. **Traces** -- inspect the full plan/act loop in **Operate → Observability → Langfuse** and **AgentCore Observability**

## Cleanup

Standard Foundry cleanup:

\`\`\`bash
./applications/fsi_foundry/scripts/cleanup/cleanup_agentcore.sh
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
