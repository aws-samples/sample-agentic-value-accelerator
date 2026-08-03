# Govern Module

> AI Governance, Risk & Compliance - one view.

The Govern module is the AI GRC (Governance, Risk, Compliance) hub for the AVA platform. It provides visibility into your AI estate, control over what it can do, and evidence to demonstrate compliance to auditors and regulators.

## Govern Core: See It, Govern It, Show It

Nine foundational modules organized into three pillars that together provide ~80% coverage across 8 major AI governance frameworks.

### See It
*What AI do we have? What's it doing? What's it costing?*

| Module | Purpose | Live Data Sources |
|--------|---------|-------------------|
| **Command Center** | Aggregated governance view with trust scores, compliance posture, risk exposure, and real-time alerts | `useLiveKPIs` aggregating 9+ govern APIs |
| **Agent Registry** | Centralized inventory of all AI agents, tools, MCP servers, capabilities, and permissions | `governAgentCoreApi.agents()`, `deploymentsApi`, `frontierAgentsApi` |
| **Agentic Fleet** | Fleet-wide governance KPIs, health monitoring, risk heatmap, emergency controls | `governAgentCoreApi.agents()`, computed risk scores |
| **Model Management** | Model registry, lifecycle management, evaluations, monitoring, risk tiers | `governModelsApi.catalog()`, `governModelsApi.runtimeMetrics()`, `governCostApi.byModel()` |
| **Cost & FinOps** | Budget tracking, spend velocity, cost by model/BU, anomaly detection, chargeback | `governCostApi.summary()`, `trend()`, `forecast()`, `byModel()`, `byTag()`, `anomalies()` |

### Govern It
*Who can do what? What rules are enforced?*

| Module | Purpose | Live Data Sources |
|--------|---------|-------------------|
| **Compliance Center** | Interactive framework checklists, attestation management, policy observability, conformance tracking | `governPostureApi`, `governConformanceApi`, `complianceApi`, `policiesApi` |
| **Prompt Governance** | Bedrock guardrails, PII detection, content filtering, grounding verification, invocation safety | `guardrailsApi`, `governGuardrailsApi.telemetry()`, `governInvocationSafetyApi` |

### Show It
*What happened? Can we demonstrate compliance?*

| Module | Purpose | Live Data Sources |
|--------|---------|-------------------|
| **Audit & Incidents** | Guardrail activity feed, incident management, audit logs, compliance evidence | `governAuditApi.list()`, `governTrailApi.aiActivity()` |
| **Data Governance** | Data quality, lineage, provenance, domains, access control, knowledge source registry | `governDataCatalogApi`, `governDataSourcesApi`, `knowledgeApi` |

---

## All Modules

### Command Center
**Route:** `/govern/command-center`

Single pane of glass for executives showing trust scores, compliance posture, risk exposure, and real-time alerts across the entire AI fleet.

**Features:**
- Aggregated KPIs from all Govern modules
- Trust score computation
- Compliance posture strip
- Risk exposure alerts
- Real-time data refresh (60s polling)

**Live Data:** Aggregates from `governAgentCoreApi`, `governGuardrailsApi`, `governSecurityApi`, `governCostApi`, `guardrailsApi`, `policiesApi`, `maturityApi`, `deploymentsApi`, `governAuditApi`

---

### Agent Registry
**Route:** `/govern/agents`

Centralized registry of all AI agents, tools, MCP servers, capabilities, and permissions across AWS, Azure, GCP, and SaaS platforms.

**Tabs:**
- Agents - Registry with capabilities, scope, owner, rate limits
- Fleet Scale - Registry at scale (10k+ agents)
- Attack Surface - Threat modeling view
- Tools - Tool inventory with risk levels
- MCP Servers - Server inventory with health status
- Permissions - Agent-to-tool authorization matrix
- Human Oversight - HITL gate configuration
- A2A Governance - Agent-to-agent trust policies
- Evaluations - AgentCore evaluation results
- Providers - Multi-cloud provider connectivity

**Live Data:** `governAgentCoreApi.agents()`, `deploymentsApi.list()`, `frontierAgentsApi.list()`

---

### Agentic Fleet
**Route:** `/govern/fleet`

Fleet-wide governance dashboard with KPIs, risk heatmap, emergency controls, and guardrail observability.

**Features:**
- 5-Pillar Control Plane posture (Registry, Access, Visualization, Interop, Security)
- Fleet Risk Posture aligned to AWS Scoping Matrix & OWASP Agentic AI Threats
- Emergency Controls (Kill, Throttle, LOG_ONLY, Restart)
- Guardrail observability with real-time metrics
- Use case risk heatmap

**Live Data:** `governAgentCoreApi.agents()`, computed risk heatmap from agent status/platform type

---

### Model Management
**Route:** `/govern/models`

Comprehensive model governance hub with registry, evaluations, explainability, compliance, and operations.

**Tabs:**
- Dashboard - Live data, KPIs, alerts
- Registry - Model inventory, risk dashboard
- Evaluations - Model evals, RAG evals, deployment gate
- Explainability - Attribution, bias & fairness
- Compliance - Governance, lifecycle, attestations
- Operations - Monitoring, ops, analysis tools

**Sub-features:** Hallucination detection, MRM Framework Explorer, Model Comparison, Risk Scoring Calculator, Dependency Graph

**Live Data:** `governModelsApi.catalog()`, `governModelsApi.runtimeMetrics()`, `governCostApi.byModel()`, `governEvalsApi.jobs()`

---

### Cost & FinOps
**Route:** `/govern/finops`

AI cost management with budget tracking, spend velocity, anomaly detection, and optimization recommendations.

**Tabs:**
- Dashboard - Real-time spend, KPIs, trend charts
- Planning - Use case cost editor
- ROI - Agent ROI calculator
- Task Fit - Task assessment for AI suitability
- Business Metrics - Business value tracking
- Unit Economics - Per-invocation cost analysis
- Token Economics - Token usage patterns
- Chargeback - Cost allocation by tag/business unit
- Optimization - Savings recommendations

**Live Data:** `governCostApi.summary()`, `trend()`, `forecast()`, `byModel()`, `byUseCase()`, `byTag()`, `tagKeys()`, `anomalies()`, `budgets()`

---

### Compliance Center
**Route:** `/govern/compliance`

Interactive compliance framework management with checklists, attestations, and policy observability.

**Features:**
- Compliance Posture Strip with live metrics
- Governance Program Builder (6-phase wizard)
- Interactive framework checklists
- Evidence attachment and links
- Attestation management
- Config Rules and Guardrails side-by-side view
- Policy Observability (Cedar ALLOW/DENY decisions)
- ISO 42001 Certification Tracker (7-phase certification journey with readiness tracking)
- Conformity Assessment Workflow (EU AI Act Article 43)
- FRIA Wizard (EU AI Act Article 27)

**ISO 42001 Certification Tracker:**
- 7 certification phases: Gap Analysis, Scope Definition, Risk Assessment, Policy Development, Implementation, Internal Audit, Certification Decision
- Collapsible card with circular progress gauge
- Per-phase tracking: status, dates, evidence links, notes
- Links to relevant Govern modules for each phase

**Conformity Assessment Workflow (EU AI Act Article 43):**
Located in the **Conformity** tab. A 6-step workflow for high-risk AI system conformity assessment:
- 6 steps: Risk Classification, Technical Documentation, QMS Verification, Post-Market Monitoring, Declaration of Conformity, CE Marking Readiness
- Per-step tracking: status, evidence checklist, responsible party, target dates, notes
- Visual workflow diagram with clickable nodes
- Progress tracker with overall completion percentage

**FRIA Wizard (EU AI Act Article 27):**
Located in the **FRIA** tab. Fundamental Rights Impact Assessment for high-risk AI systems:
- 8 fundamental rights areas: dignity, privacy, non-discrimination, equality, remedy, expression, administration, workers' rights
- Per-right assessment: impact level, mitigation measures, residual risk rating, evidence links
- Overall FRIA score calculation (0-100)
- High-risk AI systems view (Annex III categories)
- Export report capability, auto-save drafts

**GPAI Model Cards (EU AI Act Article 53):**
Located in the EU AI Act framework view. Transparency documentation for General-Purpose AI models:
- 8 documentation sections: Identity, Intended Use, Training Data, Capabilities, Evaluations, Compute, Mitigations, Known Issues
- Systemic Risk Assessment (Art. 51/55) for high-capability models
- Export capability for compliance-ready GPAI model card documents

**Compliance Gap Guidance:**
Located in the **Gap Guidance** tab. "Beyond the Platform" guidance for non-technical compliance gaps:
- Platform vs Organization split showing what the platform provides vs what the organization must do
- Interactive checklist with progress tracking for organizational gaps
- Framework-specific guidance for EU AI Act, ISO 42001, NAIC AI, and other frameworks
- Also integrated into framework-specific views (EU AI Act, ISO 42001, NAIC AI)

**NAIC AI: Unfair Discrimination Testing:**
Located in the NAIC AI framework view. Addresses NAIC Model Bulletin unfair discrimination requirements:
- 6 protected class tests with Disparate Impact Ratio (4/5ths rule)
- Proxy variable correlation analysis
- Use case selector (Underwriting, Claims, Pricing, Marketing)
- Pass/fail status with remediation guidance per protected class

**Frameworks:** SR 26-2, NIST AI RMF, EU AI Act, CRI FS AI RMF, OSFI E-23, ISO 42001, OWASP LLM Top 10, MITRE ATLAS, NAIC AI, FINOS AIR

**Live Data:** `governPostureApi.configRuleDetail()`, `governConformanceApi`, `complianceApi`, `policiesApi.getObservability()`, `maturityApi`

---

### Prompt Governance
**Route:** `/govern/prompt-governance`

AWS-native prompt compliance and governance built on Bedrock Guardrails.

**4-Layer Defense Architecture:**
1. Real-Time Guardrails (<50ms) - Bedrock native filters
2. Contextual Evaluation (50-200ms) - Grounding & relevance checks
3. Async Observability - Athena queries, trend analysis
4. Formal Verification - Automated Reasoning proofs

**Views:**
- Live Guardrails - Active guardrail configurations
- Invocations - Real-time invocation telemetry
- Heatmap - Violation patterns
- Scorecard - Metrics summary
- AgentCore - Agent-specific metrics
- Analytics - Trend analysis

**Live Data:** `guardrailsApi.list()`, `governGuardrailsApi.telemetry()`, `governInvocationSafetyApi.telemetry()`

---

### Audit & Incidents
**Route:** `/govern/audit`

Guardrail activity feed, incident management, audit logs, and compliance evidence.

**Views:**
- Metrics - Scorecard contribution (MTTR, open incidents, resolution rate)
- Audit Trail - Event log with filtering and export

**Features:**
- Live AI activity from CloudTrail
- Policy enforcement decisions (Cedar)
- Incident lifecycle management
- Trace viewer for debugging
- Evidence export for auditors

**Live Data:** `governAuditApi.list()`, `governTrailApi.aiActivity()`, `governTrailApi.aiCallers()`

---

### Data Governance
**Route:** `/govern/data`

Data quality, lineage, provenance, domains, and access control for AI-ready data.

**Tabs:**
- Dashboard - KPIs, charts, metrics
- Lineage - Data flow visualization
- Quality - Rule-based quality scoring
- Knowledge - Knowledge source registry (Glue, Bedrock KBs, Athena) with RAG Security Controls
- Assessment - Data maturity assessment

**RAG Security Controls (Knowledge Tab):**
- 8 OWASP LLM08-aligned security controls (5 critical, 3 standard)
- Interactive checklist with compliance status tracking
- Controls cover: input validation, output sanitization, access control, data classification, prompt injection prevention, logging, encryption, and version control

**Sub-routes:**
- `/govern/data/quality` - Data Quality rules and scores
- `/govern/data/metadata` - Metadata management
- `/govern/data/maturity` - Data maturity assessment
- `/govern/data/readiness` - AI readiness scoring
- `/govern/data/lineage` - Data lineage visualization
- `/govern/data/agents` - Agent data profiles
- `/govern/data/access` - Access control policies
- `/govern/data/ontology` - Data ontology editor
- `/govern/data/taxonomy` - Data taxonomy management
- `/govern/data/glossary` - Business glossary
- `/govern/data/graphrag` - GraphRAG visualization

**Live Data:** `governDataCatalogApi`, `governDataSourcesApi`, `knowledgeApi.list()`, `knowledgeApi.listDatabases()`, `knowledgeApi.listKnowledgeBases()`

---

## Additional Modules (Add-ons)

### Risk Management
**Route:** `/govern/risk`

Enterprise risk register with heatmaps, assessments, controls library, and issue tracking aligned to NIST AI RMF.

**Tabs:** Dashboard, Risk Register, Assessments, Controls, Issues, Third-Party Risk, HRAIS, Outcomes

**Outcome Monitoring Dashboard (Outcomes Tab):**
- Post-deployment AI impact tracking with decision distribution analysis
- Demographic parity metrics across protected classes
- Appeal rate monitoring and outcomes tracking
- Drift detection for model and outcome shifts over time
- Consumer harm indicators aligned to CRI FS AI RMF harm categories

**Third-Party Concentration Risk (Third-Party Risk Tab):**
- Vendor dependency breakdown showing % of agents and models per provider
- Single-vendor exposure alerts: Critical (>70% concentration), High (>50%)
- Exit strategy status tracking for concentrated vendor dependencies
- Helps address CRI FS AI RMF and OSFI E-23 third-party risk requirements

### AI Safety
**Route:** `/govern/safety`

Capability safety and assurance organized on AWS's 8 Responsible-AI dimensions.

**Sub-routes:**
- `/govern/safety/evals` - Safety evaluations
- `/govern/safety/redteam-pipeline` - Red team testing
- `/govern/safety/capabilities` - Frontier capability thresholds
- `/govern/safety/safety-cases` - Safety case documentation
- `/govern/safety/incidents` - Incident management
- `/govern/safety/runtime` - Runtime safety controls
- `/govern/threat-modeling` - MAESTRO threat modeling

### Shadow AI
**Route:** `/govern/shadow-ai`

Discover unapproved agents, models, tools, and API keys before they become incidents.

**Live Data:** `governDeveloperAiApi.usage()` - `shadow_ai` detection

### Developer AI Usage
**Route:** `/govern/developer-ai`

Monitor developer AI tool consumption (tokens, cost), detect anomalies and shadow usage.

**Live Data:** `governDeveloperAiApi.usage()` - teams, users, anomalies

### Governance Playbook
**Route:** `/govern/playbook`

Decision framework for autonomous agents with autonomy levels, HITL gates, and A2A trust policies.

### Multi-Cloud
**Route:** `/govern/multi-cloud`

Unified governance across AWS Bedrock, Azure AI Foundry, Google Vertex AI, and SaaS platforms.

**Live Data:** `governCostApi.providerConnectors()`

### Agentic Coding
**Route:** `/govern/dev-tools`

Governance for AI-powered coding assistants (Claude Code, Kiro, Copilot, Cursor).

**Live Data:** `governDeveloperAiApi.usage()` - developer tool metrics

---

## Compliance Framework Coverage

| Framework | Coverage | Key Modules |
|-----------|----------|-------------|
| **OWASP LLM Top 10** | ~80% | Prompt Governance, Cost & FinOps, Audit, Data Governance (RAG Security) |
| **FINOS AIR** | ~75% | Command Center, Prompt Governance |
| **CRI FS AI RMF** | ~75% | All Core modules, Risk Management |
| **OSFI E-23** | ~75% | Model Management, Audit, Risk Management |
| **ISO 42001** | ~75% | Model Management, Audit, Compliance Center (Certification Tracker) |
| **EU AI Act** | ~80% | Compliance Center (Conformity Assessment, FRIA Wizard, GPAI Model Cards), Audit |
| **MITRE ATLAS** | ~65% | Command Center, Risk Management |
| **NAIC AI** | ~70% | Agent Registry, Model Management, Unfair Discrimination Testing |
| **SR 26-2** | Full | Dedicated compliance view |
| **NIST AI RMF** | Full | Dedicated compliance view |

---

## Data Integration Architecture

### Live Data Pattern

All Govern modules follow a cascading fallback pattern:

```
Live AWS API → Computed from Live → Mock Fallback
```

1. **Live** - Real data from AWS APIs (Cost Explorer, Bedrock, CloudTrail, etc.)
2. **Computed** - Derived from live data (e.g., risk scores from agent status)
3. **Mock** - Illustrative data when backend is disconnected

Visual indicators:
- `<LiveDataBadge />` - Showing real AWS data
- `<MockDataBadge />` - Showing illustrative data

### Key Hooks

| Hook | Purpose |
|------|---------|
| `useAwsCost()` | Cost Explorer data with caching |
| `useGovernModels()` | Bedrock model catalog + metrics |
| `useAgentRegistry()` | Agent discovery with live fallback |
| `useGuardrailMetrics()` | Guardrail telemetry |
| `useControlEvaluation()` | Compliance posture evaluation |
| `useLiveKPIs()` | Aggregated KPIs for Command Center |
| `useAuditEvents()` | Audit log with live/mock detection |
| `useDataGovernance()` | Data catalog integration |

### Backend APIs

All govern APIs are defined in `src/api/client.ts`:

- `governCostApi` - Cost Explorer integration
- `governModelsApi` - Bedrock model catalog
- `governAgentCoreApi` - AgentCore discovery
- `governGuardrailsApi` - Guardrail telemetry
- `governInvocationSafetyApi` - Invocation safety metrics
- `governAuditApi` - Audit event log
- `governTrailApi` - CloudTrail AI activity
- `governSecurityApi` - Security Hub findings
- `governPostureApi` - Config rule compliance
- `governConformanceApi` - Conformance tracking
- `governDeveloperAiApi` - Developer AI usage
- `governDataCatalogApi` - Glue data catalog
- `governEvalsApi` - Bedrock evaluations

---

## Getting Started

### For Users

1. Navigate to **Govern** from the AVA home page
2. Start with **Command Center** for the executive overview
3. Use the **Core Only** filter to focus on foundational modules
4. Each module shows `Live` or `Mock` badges indicating data source

### For Administrators

1. Connect AWS account via the Connection Wizard on the Govern landing page
2. Enable Cost Explorer, CloudTrail, and Security Hub integrations
3. Deploy Bedrock Guardrails for prompt governance
4. Configure Cedar policies for agent authorization

### For Developers

Key files:
- `src/components/GovernLanding.tsx` - Hub page with module cards
- `src/components/govern/CoreBadge.tsx` - Core module indicator
- `src/components/govern/useGovernanceAggregator.ts` - Cross-module data aggregation
- `src/components/govern/metrics/` - Shared metric contract
- `src/api/client.ts` - All backend API definitions

---

## Related Documentation

- [Platform Architecture](./platform-architecture.md) - Overall AVA architecture
- [Govern Metrics Integration](./govern-metrics-integration.md) - Shared metric contract
- [AI Safety Module Design](./ai-safety-module-design.md) - Safety module architecture
