# Govern Module Integration Analysis

## Executive Summary

The Govern module serves as the central governance, risk, and compliance (GRC) hub for the AVA platform. It has **strong outbound integrations** to other modules (Govern links to Plan/Secure/Operate for context and actions) but **weak inbound integrations** (other modules rarely link back to Govern for governance visibility).

---

## 1. Current Integration Points

### 1.1 Govern -> Secure Module (Strong)

| Govern Component | Links To | Purpose |
|-----------------|----------|---------|
| AgentDrawer | `/secure/policy` | Edit policies for agent |
| AgentRegistry | `/secure/policy` | Manage Cedar policies |
| ComplianceCenter | `/secure/guardrails` | Framework controls implementation |
| DataAccessControl | `/secure` | Security controls reference |
| FleetOverview | `/secure/guardrails`, `/secure/policy` | Security status links |
| HallucinationDetection | `/secure/guardrails` | Configure guardrails |
| PromptGovernance | `/secure/guardrails`, `/secure/guardrails/create` | Guardrail management |
| MultiCloudGovernance | `/secure/policy`, `/secure/guardrails` | Cross-cloud policy management |
| TrustStack3Layer | `/secure/guardrails`, `/secure/policy` | Trust layer components |
| threatModelData | `/secure/guardrails`, `/secure/policy` | Control mappings |
| safety/* components | `/secure/guardrails` | Safety controls |

**Data Integration**: `useGovernanceAggregator` consumes `guardrailsApi` and `policiesApi` to show guardrail/policy status in Govern views.

### 1.2 Govern -> Plan Module (Strong)

| Govern Component | Links To | Purpose |
|-----------------|----------|---------|
| FleetOverview | `/use-cases` | Use case risk heatmap source |
| ScorecardStrip | `/plan` | Cross-module metrics |
| DataGovernance | `/applications` | Agent deployment action |
| EmptyState | `/applications` | CTA to add agents |

**Data Integration**: `useGovernanceAggregator` consumes:
- `prioritizationApi` - Use case risk scores
- `maturityApi` - Maturity assessment data
- `businessCasesApi` - Business case financials
- `operatingModelApi` - Operating model configuration

### 1.3 Govern -> Operate Module (Moderate)

| Govern Component | Links To | Purpose |
|-----------------|----------|---------|
| ComplianceCenter | `/observability` | Monitoring compliance |
| PromptGovernance | `/observability/agentcore` | Trace analysis |
| GovernanceCommandCenter | `/observability` | Operate layer visibility |
| TrustStack3Layer | Various operate routes | Layer navigation |

**Data Integration**: `useGovernanceAggregator` consumes:
- `deploymentsApi` - Deployment status and counts
- `governAgentCoreApi` - Live agent discovery from AWS

### 1.4 Govern -> Build Module (Moderate)

| Govern Component | Links To | Purpose |
|-----------------|----------|---------|
| FleetOverview | `/applications`, `/aaas/aws-agents` | Deploy actions |
| ModelManagement | `/applications`, `/aaas/aws-agents` | Model deployment |
| GovernanceCommandCenter | `/applications/*`, `/aaas/*`, `/capabilities/*` | Build layer mapping |
| DataOntology | `/capabilities/knowledge` | Knowledge base integration |
| GraphRAG | `/capabilities/knowledge` | RAG knowledge link |
| BusinessGlossary | `/aaas` | Agent deployment CTA |

**Data Integration**: `useGovernanceAggregator` consumes:
- `frontierAgentsApi` - Frontier agent catalog
- `serviceApprovalApi` - Service onboarding runs

---

## 2. Inbound Links (Other Modules -> Govern)

### 2.1 Secure -> Govern (Weak)

| Secure Component | Links To | Purpose |
|-----------------|----------|---------|
| gateway/KeyManagement | `/govern` | Breadcrumb only |
| gateway/SpendDashboard | `/govern` | Breadcrumb only |

**Gap**: Guardrails and Policy pages do not link to Govern for compliance status, risk context, or audit trails.

### 2.2 Plan -> Govern (None)

No direct navigation links found from:
- PlanLanding
- Prioritization  
- MaturityAssessment
- BusinessCases
- OperatingModel
- OrganizationDesign

**Gap**: Use cases scored in Plan should link to their Govern risk profile and compliance status.

### 2.3 Operate -> Govern (None)

No direct navigation links found from:
- DeploymentDetail
- DeploymentList
- Observability
- ObservabilityLanding

**Gap**: Deployments should show governance status (guardrail coverage, policy compliance, audit events).

### 2.4 Build -> Govern (None)

No direct navigation links found from:
- FSIFoundryCatalog
- ReferenceImplementations
- ApplicationsLanding
- AwsAgentsCatalog
- CustomAgentsCatalog
- Capabilities pages

**Gap**: Build components should indicate governance readiness and link to compliance requirements.

### 2.5 Home -> Govern (Present)

Home.tsx has a Govern card that navigates to `/govern`.

---

## 3. Data Sharing Analysis

### 3.1 Data Govern Consumes

| Source | API | Data | Used In |
|--------|-----|------|---------|
| Secure | `guardrailsApi` | Guardrail templates, metrics | FleetOverview, FinOps, CommandCenter |
| Secure | `policiesApi` | Cedar policies | AgentRegistry, MultiCloud |
| Plan | `prioritizationApi` | Use case scores | Risk heatmaps, FleetOverview |
| Plan | `maturityApi` | Maturity assessments | TrustStack, CommandCenter |
| Plan | `businessCasesApi` | Financial models | FinOps ROI calculations |
| Operate | `deploymentsApi` | Deployment status | Fleet metrics, audit feed |
| Build | `frontierAgentsApi` | Agent catalog | AgentRegistry, Multi-cloud |
| AWS | `governAgentCoreApi` | Live Bedrock agents | FleetOverview, AgentRegistry |

### 3.2 Data Govern Produces

| Data | Could Be Used By | Current Status |
|------|------------------|----------------|
| Trust scores | All modules | Not exposed |
| Risk profiles | Plan (use cases), Build (deploy gates) | Not consumed |
| Compliance status | Secure (guardrail coverage), Operate (deploy checks) | Not consumed |
| Cost/FinOps metrics | Build (budget gates), Operate (spend alerts) | Not consumed |
| Audit events | Secure (policy audit), Operate (incident correlation) | Not consumed |

### 3.3 Duplicate Data Fetches

1. **Guardrail metrics**: Fetched in both Govern (`useGuardrailMetrics`) and Secure (`GuardrailMetricsDashboard`)
2. **Deployment status**: Fetched in Govern (`useGovernanceAggregator`) and Operate (`DeploymentDetail`)
3. **Agent inventory**: Fetched separately by Govern (`useAgentRegistry`) and Build/AaaS components

---

## 4. Navigation Flow Analysis

### 4.1 Breadcrumbs

Govern components use consistent breadcrumbs:
```
Back to Home <- Back to Govern <- [Current Page]
```

Other modules do NOT include Govern in their breadcrumb paths even when governance context would be relevant.

### 4.2 Cross-Module Navigation Gaps

| Scenario | Expected Flow | Actual State |
|----------|--------------|--------------|
| Guardrail violation | Secure -> Govern Audit | No link exists |
| Use case risk assessment | Plan -> Govern Risk | No link exists |
| Deployment compliance | Operate -> Govern Compliance | No link exists |
| Agent deployment readiness | Build -> Govern Fleet | No link exists |

---

## 5. Shared Services Analysis

### 5.1 API Clients

All modules use centralized `api/client.ts`:
- Single axios instance with interceptors
- Shared authentication handling
- Consistent error handling

**No duplication** - well-architected.

### 5.2 Hooks

| Hook | Location | Potential for Extraction |
|------|----------|-------------------------|
| `useGovernanceAggregator` | govern/ | Could expose data to other modules |
| `useGuardrailMetrics` | govern/ | Could be shared with Secure |
| `useAgentRegistry` | govern/ | Could be shared with Build/AaaS |
| `useAwsCost` | govern/ | Could be shared with LLM Gateway |

### 5.3 State Management

Currently no cross-module context providers exist beyond:
- `AuthContext` - Authentication
- `UserContext` - User info

**Gap**: No shared governance state context that other modules could subscribe to.

---

## 6. Missing Integrations (Prioritized)

### Priority 1: High Impact, Low Effort

| Integration | Source | Target | Impact |
|-------------|--------|--------|--------|
| Guardrail status in Build | Govern | FSIFoundryCatalog, ReferenceImplementations | Shows governance coverage before deploy |
| Risk score badge in Plan | Govern | Prioritization use case cards | Surfaces risk context where decisions are made |
| Compliance indicator in Deployments | Govern | DeploymentDetail | Shows compliance status inline |

### Priority 2: High Impact, Medium Effort

| Integration | Source | Target | Impact |
|-------------|--------|--------|--------|
| Audit trail link from Secure | Govern | Guardrails observability | Full audit context |
| Cost metrics in LLM Gateway | Govern FinOps | LLM Gateway spend tab | Unified cost view |
| Agent governance status in AaaS | Govern | AwsAgentsCatalog, CustomAgentsCatalog | Governance readiness |

### Priority 3: Medium Impact, Higher Effort

| Integration | Source | Target | Impact |
|-------------|--------|--------|--------|
| Shared governance context | Govern | All modules | Real-time governance status subscription |
| Policy compliance in Build | Secure + Govern | App Factory, Custom Agents | Pre-deployment policy checks |
| Data readiness in Build | Govern Data | Knowledge bases, RAG deployments | Data governance gating |

---

## 7. Recommendations

### 7.1 Immediate Actions

1. **Add Govern links to Secure components**:
   - Guardrails.tsx: Add link to `/govern/audit` for compliance audit trail
   - Policy.tsx: Add link to `/govern/compliance` for framework mapping

2. **Add Govern status badges to Plan**:
   - Prioritization.tsx: Show risk tier badge from Govern on use case cards
   - BusinessCases.tsx: Show compliance readiness indicator

3. **Add Govern context to Operate**:
   - DeploymentDetail.tsx: Add governance status section (guardrails, policies, audit events)

### 7.2 Medium-Term Improvements

1. **Create `GovernanceStatusContext`**:
   ```typescript
   interface GovernanceStatus {
     trustScore: number;
     openIncidents: number;
     guardrailCoverage: number;
     complianceStatus: Record<string, number>;
   }
   ```
   - Expose via provider at App level
   - Allow all modules to subscribe

2. **Extract shared hooks to `src/hooks/`**:
   - `useGuardrailStatus` - Guardrail coverage and metrics
   - `useAgentInventory` - Agent counts by provider
   - `useComplianceStatus` - Framework coverage

3. **Add governance gate to deployment flow**:
   - DeploymentCreate.tsx: Check governance readiness
   - Show warnings for missing guardrails/policies

### 7.3 Long-Term Vision

1. **Unified navigation context aware of governance state**:
   - Highlight modules with governance issues
   - Badge counts for pending actions

2. **Cross-module notifications**:
   - Governance events surface in Operate
   - Policy changes reflect in Build
   - Risk updates appear in Plan

3. **Governance API layer**:
   - Expose Govern aggregations via API
   - Allow external tools to query governance status

---

## 8. Integration Map Diagram

```
                    +------------------+
                    |     GOVERN       |
                    |   (Central GRC)  |
                    +--------+---------+
                             |
        +--------------------+--------------------+
        |                    |                    |
        v                    v                    v
+-------+-------+    +-------+-------+    +-------+-------+
|     PLAN      |    |     SECURE    |    |    OPERATE    |
|               |    |               |    |               |
| - Maturity    |    | - Guardrails  |    | - Deployments |
| - Use Cases   |<---|   (strong)    |<---| - Observ      |
| - Biz Cases   |    | - Policies    |    |               |
+---------------+    +-------+-------+    +-------+-------+
        ^                    |                    ^
        |                    v                    |
        |            +-------+-------+            |
        +------------|     BUILD     |------------+
                     |               |
                     | - Applications|
                     | - AaaS        |
                     | - Capabilities|
                     +---------------+

Legend:
  ---> Govern links TO other module (strong)
  <--- Other module links TO Govern (weak/missing)
```

---

## Appendix: Files Analyzed

### Govern Module Files
- GovernLanding.tsx
- govern/FleetOverview.tsx
- govern/AgentRegistry.tsx
- govern/ComplianceCenter.tsx
- govern/FinOps.tsx
- govern/useGovernanceAggregator.ts
- govern/MultiCloudGovernance.tsx
- govern/PromptGovernance.tsx
- govern/GovernanceCommandCenter.tsx

### Other Module Files
- PlanLanding.tsx
- Prioritization.tsx
- SecureLanding.tsx
- Guardrails.tsx
- Policy.tsx
- ObservabilityLanding.tsx
- DeploymentDetail.tsx
- Home.tsx
- Sidebar.tsx
- App.tsx (routing)

### API/Services
- api/client.ts (shared API client)
- contexts/UserContext.tsx (shared context)
