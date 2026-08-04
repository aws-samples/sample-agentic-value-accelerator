# Govern Module

> AI Governance, Risk & Compliance - one view.

The AI GRC hub your executives, auditors, and engineers share. Monitor trust, track compliance, manage risk, and control cost across every agent in your fleet.

## Overview

Govern is the governance layer of the Agentic Value Accelerator (AVA) platform. It provides comprehensive AI governance capabilities organized around three pillars: **See It** (visibility), **Govern It** (control), and **Show It** (accountability). The module integrates with AWS services for live data and provides illustrative mock data where integrations are pending.

---

## Govern Core: See It, Govern It, Show It

The 9 foundational Core modules deliver ~75-80% coverage across 8 major AI governance frameworks (NIST AI RMF, EU AI Act, ISO 42001, OWASP LLM Top 10, MITRE ATLAS, OSFI E-23, NAIC AI Guidelines, FINOS AIR).

### See It (Blue)
Visibility into your AI estate - what's deployed, how it's performing, what it costs.

| Module | Route | Purpose |
|--------|-------|---------|
| Command Center | `/govern/command-center` | Aggregated governance dashboard |
| Agent Registry | `/govern/agents` | Centralized agent inventory |
| Agentic Fleet | `/govern/fleet` | Fleet-wide governance KPIs |
| Model Management | `/govern/models` | Model registry and lifecycle |
| Cost & FinOps | `/govern/finops` | Budget tracking and optimization |

### Govern It (Violet)
Policy enforcement and compliance management.

| Module | Route | Purpose |
|--------|-------|---------|
| Compliance Center | `/govern/compliance` | Framework checklists and evidence |
| Prompt Governance | `/govern/prompt-governance` | Runtime prompt compliance |

### Show It (Emerald)
Audit trails and evidence for regulators.

| Module | Route | Purpose |
|--------|-------|---------|
| Audit & Incidents | `/govern/audit` | Activity feed and incident management |
| Data Governance | `/govern/data` | Data quality, lineage, and access control |

---

## All Modules

### Command Center
- **Purpose**: Single pane of glass for executives showing trust scores, compliance posture, risk exposure, and real-time alerts across your entire AI fleet.
- **Key Features**:
  - Platform-wide trust score aggregation
  - Compliance posture strip with live metrics
  - Risk heatmap with severity distribution
  - Real-time alerts and notifications
- **Live Data**: AVA APIs (use cases, maturity, business cases), AWS CloudWatch metrics
- **Route**: `/govern/command-center`
- **Core Pillar**: See It

### Trust Stack
- **Purpose**: Deep dive into the 3-layer governance maturity model: Foundation, Production, Scale. Shows AWS services, key controls, and 3 Lines of Defense activities.
- **Key Features**:
  - Interactive layer exploration (Foundation/Production/Scale)
  - AWS service mapping per layer
  - 3 Lines of Defense activity tracking
  - Control coverage visualization
- **Live Data**: AWS Config compliance status
- **Route**: `/govern/trust-stack`

### Agent Registry
- **Purpose**: Centralized inventory of all AI agents, tools, MCP servers, capabilities, and permissions across AWS, Azure, GCP, and SaaS platforms.
- **Key Features**:
  - Multi-cloud agent discovery
  - Tool and MCP server inventory
  - Permission tracking per agent
  - Provider filtering (AWS Bedrock, Azure AI, GCP Vertex, ServiceNow, Salesforce)
- **Live Data**: AVA frontier agents API, AWS Bedrock agent inventory
- **Route**: `/govern/agents`
- **Core Pillar**: See It

### Agentic Fleet
- **Purpose**: Fleet-wide governance and KPIs across your entire agent ecosystem. Monitor health, performance, and compliance status for all deployed agents.
- **Key Features**:
  - Fleet health dashboard (agent count, healthy %, alerts)
  - Performance metrics by agent
  - Compliance status aggregation
  - Scale view for large fleets (10k+ agents)
- **Live Data**: AVA deployments API, AWS CloudWatch agent metrics
- **Route**: `/govern/fleet`
- **Core Pillar**: See It

### Model Management
- **Purpose**: Model registry, lifecycle management, evaluations, and monitoring. Track risk tiers, validation status, and cost per model.
- **Key Features**:
  - Live Bedrock model catalog
  - Model lifecycle stages (development, staging, production, deprecated)
  - Risk tier classification (1-4)
  - Model evaluations and benchmarks
  - Cost-per-model tracking
- **Live Data**: AWS Bedrock `ListFoundationModels`, CloudWatch model metrics, Cost Explorer
- **Partial Live**: Model catalog and runtime metrics are live; risk tiers and attestation are illustrative
- **Route**: `/govern/models`
- **Core Pillar**: See It

### Shadow AI
- **Purpose**: Discover unapproved agents, models, tools, and API keys before they become incidents. Track governed-vs-shadow coverage.
- **Key Features**:
  - Unapproved user detection
  - Unknown tool discovery
  - Unapproved model detection
  - Coverage tracking (governed vs shadow)
  - Onboarding workflow for discovered assets
- **Live Data**: AVA developer AI API
- **Route**: `/govern/shadow-ai`

### Risk Management
- **Purpose**: Complete risk register with heatmaps, assessments, controls library, and issue tracking. Aligned to NIST AI RMF and SR 26-2.
- **Key Features**:
  - Risk register with 10 categories
  - Interactive risk heatmap (likelihood x impact)
  - Controls library (25+ controls)
  - Issue tracking and remediation
  - Third-party risk management (TPRM tab)
  - HRAIS assessment integration
- **Live Data**: AWS Security Hub findings, AVA use case risks
- **Partial Live**: Security findings are live; controls and issues are illustrative
- **Route**: `/govern/risk`

### AI Safety
- **Purpose**: Capability safety and assurance for autonomous AI. Organized on AWS's 8 Responsible-AI dimensions.
- **Key Features**:
  - RAI Coverage Rubric (8 dimensions: Fairness, Explainability, Privacy/Security, Safety, Controllability, Veracity/Robustness, Governance, Transparency)
  - Frontier capability thresholds
  - MAESTRO threat modeling
  - Safety cases documentation
  - Incident management
  - Red-team evaluation pipeline
- **Sub-routes**:
  - `/govern/safety/capabilities` - Frontier Thresholds
  - `/govern/safety/threat-modeling` - MAESTRO
  - `/govern/safety/safety-cases` - Safety Cases
  - `/govern/safety/incidents` - Incident Management
  - `/govern/safety/evals` - Safety Evaluations
  - `/govern/safety/redteam-pipeline` - Red Team Pipeline
  - `/govern/safety/runtime` - Runtime Safety Controls
- **Live Data**: Agent registry guardrail coverage, incident counts
- **Route**: `/govern/safety`

### Prompt Governance
- **Purpose**: Full prompt compliance pipeline: pre-invocation analysis, guardrail enforcement, grounding verification, reasoning trace analysis, and policy violation mapping.
- **Key Features**:
  - Pre-invocation PII/PHI/PCI detection
  - Guardrail enforcement monitoring
  - Grounding verification (RAG hallucination detection)
  - Reasoning trace analysis
  - Policy violation mapping to frameworks
- **Live Data**: AWS Bedrock Guardrails, CloudWatch guardrail metrics
- **Route**: `/govern/prompt-governance`
- **Core Pillar**: Govern It

### Developer AI Usage
- **Purpose**: Monitor developer AI tool consumption (tokens, cost), detect spend anomalies and runaway loops, and identify shadow AI usage.
- **Key Features**:
  - Per-user token/cost tracking
  - Spend anomaly detection
  - Runaway loop identification
  - Shadow AI user detection
  - Tool breakdown (Claude Code, Copilot, etc.)
- **Live Data**: AVA developer AI API
- **Route**: `/govern/developer-ai`

### Compliance Center
- **Purpose**: Interactive checklists for regulatory frameworks. Track control status, evidence, and gaps.
- **Key Features**:
  - 13 compliance frameworks
  - Interactive control checklists with checkboxes
  - Evidence attachment and links
  - Notes per control
  - Progress tracking with visual indicators
  - Revalidation tracking
  - Attestation management
  - Governance Program Builder (6-phase wizard)
- **Supported Frameworks**:
  - SR 26-2 (NY DFS AI Regulation)
  - NIST AI RMF
  - EU AI Act
  - CRI FS AI RMF
  - OSFI E-23
  - ISO 42001
  - OWASP LLM Top 10
  - MITRE ATLAS
  - NAIC Model Bulletin
  - FINOS AIR
  - And more...
- **Live Data**: AWS Config rule compliance
- **Partial Live**: Config compliance is live; framework attestations are illustrative
- **Route**: `/govern/compliance`
- **Core Pillar**: Govern It

### Cost & FinOps
- **Purpose**: Budget tracking, spend velocity, cost by model and BU, anomaly detection, and optimization recommendations.
- **Key Features**:
  - Live AWS spend from Cost Explorer
  - Budget vs actual tracking
  - Cost anomaly detection
  - Spend by model and service
  - 12-month forecast
  - Provider cost comparison (multi-cloud)
  - Unit economics calculator
  - Token economics analysis
  - Chargeback allocation
  - Optimization recommendations
- **Tabs**: Dashboard, Planning, ROI, Task Fit, Business Value, Unit Economics, Token Economics, Chargeback, Optimization
- **Live Data**: AWS Cost Explorer, AWS Budgets
- **Partial Live**: Spend, forecast, anomalies, by-model costs, and budgets are live; chargeback and TCO models are illustrative
- **Route**: `/govern/finops`
- **Core Pillar**: See It

### Audit & Incidents
- **Purpose**: Guardrail activity feed, incident management, audit logs, and compliance evidence. Full traceability for regulators.
- **Key Features**:
  - Real-time guardrail event stream
  - Incident register with lifecycle tracking
  - CloudTrail AI activity integration
  - Compliance evidence export
  - Event filtering and search
- **Live Data**: AWS CloudTrail, Bedrock ApplyGuardrail events
- **Partial Live**: CloudTrail events are live; incident lifecycle is illustrative
- **Route**: `/govern/audit`
- **Core Pillar**: Show It

### Data Governance
- **Purpose**: AI-ready data management: quality, lineage, provenance, domains, and access control.
- **Key Features**:
  - Data quality rules and validation
  - Data lineage visualization
  - Agent data profiles
  - Access control tracking
  - Knowledge architecture (GraphRAG, Ontology, Taxonomy, Glossary)
  - AI readiness assessment (7 dimensions)
  - Maturity journey roadmap
- **Sub-routes**:
  - `/govern/data/agents` - Agent Data Profiles
  - `/govern/data/lineage` - Data Lineage
  - `/govern/data/access` - Access Control
  - `/govern/data/quality` - Data Quality
  - `/govern/data/graphrag` - GraphRAG
  - `/govern/data/ontology` - Data Ontology
  - `/govern/data/taxonomy` - Data Taxonomy
  - `/govern/data/glossary` - Business Glossary
  - `/govern/data/readiness` - AI Readiness Assessment
  - `/govern/data/maturity` - Maturity Journey
  - `/govern/data/metadata` - Metadata Management
- **Live Data**: AWS Glue Data Catalog, AVA service approvals
- **Route**: `/govern/data`
- **Core Pillar**: Show It

### Governance Playbook
- **Purpose**: Decision framework for autonomous agents. Configure autonomy levels, design HITL gates, and establish A2A trust policies.
- **Key Features**:
  - Autonomy ladder (4 levels: Assisted, Semi-autonomous, Supervised, Autonomous)
  - HITL gate design patterns
  - A2A trust evaluator
  - AWS integration patterns
- **Live Data**: Illustrative (framework guidance)
- **Route**: `/govern/playbook`

### Multi-Cloud Governance
- **Purpose**: Unified governance across AWS Bedrock, Azure AI Foundry, Google Vertex AI, and SaaS platforms.
- **Key Features**:
  - Cross-provider capability comparison
  - Migration planning tools
  - Consistent policy enforcement
  - Provider-specific governance controls
- **Live Data**: Illustrative (multi-cloud patterns)
- **Route**: `/govern/multi-cloud`

### Agentic Coding
- **Purpose**: Govern AI-powered coding assistants - Claude Code, Kiro, Copilot, Cursor.
- **Key Features**:
  - API routing compliance tracking
  - Code context exposure monitoring
  - Shadow usage detection
  - Tool-specific policies
- **Live Data**: AVA developer AI API
- **Route**: `/govern/dev-tools`

### Third-Party Risk
- **Purpose**: Manage AI vendor risk with due diligence questionnaires, contract tracking, and exit strategies.
- **Key Features**:
  - Vendor DDQ management
  - Contract tracking
  - Concentration analysis
  - Exit strategy planning
- **Live Data**: Illustrative (TPRM patterns)
- **Route**: `/govern/risk?tab=third-party`

---

## Compliance Framework Coverage

Govern tracks compliance across 13 regulatory frameworks:

| Framework | Focus | Controls |
|-----------|-------|----------|
| SR 26-2 | NY DFS AI Regulation (FSI) | Governance, risk, model validation |
| NIST AI RMF | US federal AI risk management | GOVERN, MAP, MEASURE, MANAGE |
| EU AI Act | European AI regulation | Risk classification, conformity |
| CRI FS AI RMF | Financial services AI risk | Industry-specific controls |
| OSFI E-23 | Canadian model risk (FSI) | Model governance, validation |
| ISO 42001 | AI management system standard | Certification-ready controls |
| OWASP LLM Top 10 | LLM security vulnerabilities | Prompt injection, data leakage |
| MITRE ATLAS | Adversarial ML techniques | Threat modeling, mitigations |
| NAIC Model Bulletin | Insurance AI guidance | Fairness, governance |
| FINOS AIR | Open-source AI readiness | Financial services patterns |
| AWS Well-Architected ML | AWS best practices | Pillar-based assessment |
| Singapore MAS | Singapore AI guidance | FSI governance |
| Hong Kong HKMA | HK AI guidance | FSI governance |

---

## Data Source Status

Govern displays a mix of live AWS data and illustrative mock data.

### Fully Live Data Sources
- Use cases, business cases, maturity assessments, operating models (AVA Plan APIs)
- Deployments, frontier agents (AVA Build APIs)
- Guardrails, service approvals (AVA Secure APIs)
- Guardrail metrics (Amazon Bedrock CloudWatch)
- Model runtime metrics - invocations, latency, tokens, errors (CloudWatch AWS/Bedrock)
- Config compliance (AWS Config `DescribeComplianceByConfigRule`)
- Security findings (AWS Security Hub)
- AI activity trail (AWS CloudTrail)

### Partially Live Data Sources
| Data Source | Live Slice | Illustrative |
|-------------|------------|--------------|
| Model Inventory | Bedrock catalog + runtime + cost | Risk tiers, attestation metadata |
| Model Evaluations | Bedrock eval-job list | Per-metric scores, published benchmarks |
| Cost & FinOps | Spend, forecast, anomalies, by-model, budgets | Chargeback, TCO models |
| Audit Trail | CloudTrail + guardrail events | Incident lifecycle |
| Compliance Status | AWS Config rules | Framework attestations |
| Risk Register | Security Hub + use case risks | Controls, issues |

---

## Technical Architecture

### Live Data Integration Pattern

```
Frontend Component
    |
    v
useHook (e.g., useAwsCost, useGovernModels)
    |
    v
API Client (src/api/client.ts)
    |
    v
Backend FastAPI (control_plane/backend)
    |
    v
AWS APIs (Bedrock, CloudWatch, Cost Explorer, Config, Security Hub, CloudTrail)
```

### Key Hooks
- `useGovernModels` - Bedrock model catalog and metrics
- `useAwsCost` - Cost Explorer data
- `useGovernanceAggregator` - Cross-module metrics
- `useLiveKPIs` - Real-time governance KPIs
- `useAgentRegistry` - Agent inventory
- `useControlEvaluation` - Config compliance

### Mock Fallback Behavior
When AWS integrations are unavailable, components fall back to mock data:
1. API call returns error or empty data
2. Component catches error in useEffect
3. Falls back to mock data from `mockData.ts`
4. Displays `MockDataBadge` indicator

### Data Source Indicators
- `LiveDataBadge` - Green indicator for live AWS data
- `MockDataBadge` - Amber dashed indicator for demo data

### Autonomy Levels
Autonomy levels use a single canonical source (`AGENT_SCOPE_META` in `autonomyLadder.ts`):
- Level 1: Assisted - Human approves every action
- Level 2: Semi-autonomous - Human approves high-risk actions
- Level 3: Supervised - AI acts, human monitors
- Level 4: Autonomous - AI acts independently within guardrails

See `AUTONOMY_LADDER_RECONCILIATION.md` for reconciliation details.

---

## Getting Started

### For New Users

1. **Start at the Landing Page** (`/govern`)
   - View all 17 governance modules as cards
   - Use "Core Only" filter to focus on essential 9 modules
   - Check the Shadow AI alert banner for urgent issues

2. **Begin with Command Center** (`/govern/command-center`)
   - Get the executive view of your AI governance posture
   - See trust scores, compliance status, and risk exposure

3. **Explore by Pillar**
   - **See It**: Start with Agent Registry and Model Management to inventory your AI estate
   - **Govern It**: Use Compliance Center to assess your regulatory posture
   - **Show It**: Check Audit & Incidents for traceability

### For Administrators

1. **Connect AWS** - Use the Connection Wizard on the landing page
2. **Review Data Sources** - Expand the Data Sources panel to see integration status
3. **Configure Live Data** - Enable AWS integrations for real-time governance

### Module Guides

Each module includes inline help:
- **How to Use Guide** - Step-by-step usage instructions
- **Go Live Guide** - Instructions for enabling live AWS data
- **Setup Guidance** - Configuration requirements

---

## Key Files

| File | Purpose |
|------|---------|
| `CoreBadge.tsx` | Core badge component, pillar legend, module registry |
| `GovernWrapper.tsx` | Shared layout wrapper for all Govern pages |
| `GovernPageLayout.tsx` | Standard page layout component |
| `DataSourceIndicator.tsx` | Live/Mock data badge components |
| `CommandCenter.tsx` | Command Center module |
| `GovernanceCommandCenter.tsx` | Main command center / observability hub |
| `AgentRegistry.tsx` | Agent inventory and discovery |
| `FleetOverview.tsx` | Fleet-wide metrics and monitoring |
| `ModelManagement.tsx` | Model catalog and governance |
| `FinOps.tsx` | Cost tracking and FinOps capabilities |
| `ComplianceCenter.tsx` | Framework compliance and attestations |
| `PromptGovernance.tsx` | Prompt guardrails and PII controls |
| `AuditIncidents.tsx` | Audit trail and incident management |
| `RiskManagement.tsx` | Risk register and controls |
| `ShadowAI.tsx` | Shadow AI detection |
| `TrustStackPage.tsx` | Trust Stack 3-layer model |
| `AgenticGovernancePlaybook.tsx` | Governance playbook |
| `MultiCloudGovernance.tsx` | Multi-cloud governance |
| `DevToolsGovernance.tsx` | Agentic coding governance |
| `DeveloperAiUsageView.tsx` | Developer AI usage tracking |
| `autonomyLadder.ts` | Canonical autonomy level definitions |
| `mockData.ts` | Mock data definitions for fallback |

### Sub-module Directories

| Directory | Purpose |
|-----------|---------|
| `safety/` | AI Safety sub-modules (RAI dimensions, frontier, MAESTRO) |
| `data/` | Data Governance sub-modules (quality, lineage, GraphRAG) |
| `finops/` | FinOps sub-components (ROI, token economics, chargeback) |
| `risk/` | Risk sub-components (register, dashboard, TPRM) |
| `metrics/` | Metrics panels and scorecard components |

---

## Core Module Implementation

Core badges appear on module cards and page headers via `CoreBadge.tsx`. Users can filter to "Core Only" view on the Govern landing page. All Core modules are wired to live AWS APIs with graceful mock fallback.

Module definitions in `CoreBadge.tsx`:

```typescript
export const CORE_MODULES: Record<string, { isCore: true; pillar: 'see' | 'govern' | 'show' }> = {
  'command-center': { isCore: true, pillar: 'see' },
  'agents': { isCore: true, pillar: 'see' },
  'fleet': { isCore: true, pillar: 'see' },
  'models': { isCore: true, pillar: 'see' },
  'finops': { isCore: true, pillar: 'see' },
  'compliance': { isCore: true, pillar: 'govern' },
  'prompt-governance': { isCore: true, pillar: 'govern' },
  'audit': { isCore: true, pillar: 'show' },
  'data': { isCore: true, pillar: 'show' },
};
```
