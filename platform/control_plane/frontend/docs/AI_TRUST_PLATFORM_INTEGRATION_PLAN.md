# AI Trust Platform → AVA Integration Plan

> **Purpose:** Map AI Trust Platform capabilities to AVA platform gaps and define integration roadmap.
>
> **Last Updated:** 2026-05-26

---

## Executive Summary

The AI Trust Platform has **95+ pages** of governance, explainability, and compliance features built on React + BlueprintJS. AVA has a modern React + Tailwind frontend with strong FSI Foundry (34 use cases) but gaps in governance tooling (Layer 3 at 45% completion).

**Integration Goal:** Bring AI Trust Platform's battle-tested governance modules into AVA to complete the Trust Stack.

---

## Platform Comparison

| Aspect | AI Trust Platform | AVA Platform |
|--------|-------------------|--------------|
| Framework | React 18 + BlueprintJS 5 | React 18 + Tailwind CSS |
| Charting | Recharts | Recharts |
| Backend | Python/Flask + Bedrock APIs | Python/FastAPI (partial) |
| LOC | ~95,500 | ~45,000 |
| Pages | 95+ | 40+ |
| Data | Live Bedrock + CloudTrail + mock | Mostly mock |

**Compatibility:** HIGH - Same React version, same charting library, similar component patterns.

---

## AVA Current State (Trust Stack Layers)

### Layer 1: Establish a Secure Foundation — 75%
| Feature | Status | Notes |
|---------|--------|-------|
| Guardrail Builder | ✓ Implemented | 5 types, deploys to Bedrock |
| Guardrail Templates | ✓ Implemented | CRUD + live preview |
| Service Onboarding | ✓ Implemented | Guided approval flow |
| Tools Factory | ○ Coming Soon | 0/6 tools |
| Knowledge Bases | ◐ Partial | 3/6 available |

### Layer 2: Build a Path to Production — 85%
| Feature | Status | Notes |
|---------|--------|-------|
| FSI Foundry | ✓ Implemented | 34 use cases, deployable |
| Deployment Patterns | ✓ Implemented | EC2, Step Functions, AgentCore |
| Agent Frameworks | ✓ Implemented | LangGraph, Strands, CrewAI, LlamaIndex |
| Custom Agent Builder | ◐ UI Only | Deployment not wired |
| Model Registry | ◐ UI Only | Mock data, no live Bedrock |

### Layer 3: Observe and Scale — 45%
| Feature | Status | Notes |
|---------|--------|-------|
| Frontier Agents | ◐ Partial | 2/3 (DevOps, Security; Kiro coming) |
| Govern Dashboard | ◐ UI Only | All mock data |
| Risk Heatmap | ◐ UI Only | Mock data |
| FinOps | ◐ UI Only | Mock data |
| Compliance | ◐ UI Only | Framework list only, no tracking |
| Audit Trail | ◐ UI Only | Mock events |
| Explainability | ○ Not Started | None |
| Fair Lending | ○ Not Started | None |

---

## AI Trust Platform Feature Inventory

### Category: Explainability (HIGH VALUE - AVA has none)

| AI Trust Page | Description | AVA Target | Priority | Effort |
|---------------|-------------|------------|----------|--------|
| `LiveExplainability.js` | Real-time LIME/SHAP/Anchor analysis on any prompt | `/govern/explainability` | **P1** | Medium |
| `AdvancedExplainability.js` | Counterfactual analysis, adverse action letters | `/govern/explainability/advanced` | **P1** | Medium |
| `Explainability.js` | LIME explanations for credit decisions | Merge into above | P2 | Low |
| `ExplanationEvaluator.js` | Test explanation quality | `/govern/explainability/eval` | P3 | Low |
| `XAIGallery.js` | Visualization gallery of explanation types | Docs/reference | P4 | Low |

**Backend Required:**
- `/api/explain` - LIME explanation endpoint
- `/api/explain/counterfactual` - What-if analysis
- `/api/explain/adverse-action` - ECOA letter generation

---

### Category: Fair Lending & Bias (HIGH VALUE - AVA has none)

| AI Trust Page | Description | AVA Target | Priority | Effort |
|---------------|-------------|------------|----------|--------|
| `FairLending.js` | ECOA/FHA dashboard, 7 protected classes, 16 test scenarios | `/govern/fair-lending` | **P1** | Medium |
| `BiasMonitoring.js` | Disparate impact ratios, four-fifths rule, demographic testing | `/govern/bias` | **P1** | Medium |
| `FairLendingAndBias.js` | Combined view | Merge into above | P3 | Low |

**Backend Required:**
- `/api/fairlending/metrics` - Protected class approval rates
- `/api/fairlending/test` - Run bias test scenarios
- Evidence hashing (SHA-256) for audit integrity

---

### Category: Risk Assessment (HIGH VALUE - AVA has mock only)

| AI Trust Page | Description | AVA Target | Priority | Effort |
|---------------|-------------|------------|----------|--------|
| `RiskAssessment.js` | 6-dimension framework, heat map, three lines of defense | Replace `/govern` risk section | **P1** | Low |
| `RAIAssessmentWizard.js` | Guided responsible AI assessment | `/govern/rai-assessment` | P2 | Medium |
| `RAIPortfolioHeatmap.js` | Portfolio-level risk view | `/govern` dashboard | P2 | Low |
| `RAIRiskRating.js` | Risk rating component | Shared component | P3 | Low |
| `TrustAssessment.js` | Trust score calculation | Already have TrustStack3Layer | P4 | Low |

**Backend Required:**
- `/api/risk/assessment` - CRUD for risk assessments
- `/api/risk/portfolio` - Aggregate portfolio view

---

### Category: Model Management (MEDIUM VALUE - AVA has mock UI)

| AI Trust Page | Description | AVA Target | Priority | Effort |
|---------------|-------------|------------|----------|--------|
| `ModelInventory.js` | Live Bedrock model listing | Wire to `/govern/models` | **P1** | Low |
| `Model360.js` | Single model deep-dive with radar chart | `/govern/models/:id` | P2 | Low |
| `ModelLifecycle.js` | ACTIVE→LEGACY→EOL tracking | `/govern/models/lifecycle` | P2 | Medium |
| `ModelRegistry.js` | Registry browser | Already exists in AVA | P4 | - |
| `ModelComparison.js` | Side-by-side model comparison | `/govern/models/compare` | P3 | Medium |
| `ModelPerformance.js` | Performance metrics over time | `/govern/models/:id/perf` | P3 | Medium |
| `ModelRiskManagement.js` | SR 26-2 / MRM dashboard | `/govern/mrm` | P2 | Medium |

**Backend Required:**
- `/api/bedrock/models` - List available models (exists in AI Trust)
- `/api/bedrock/models/:id` - Model details
- `/api/models/lifecycle` - Lifecycle status tracking

---

### Category: Compliance & Controls (MEDIUM VALUE - AVA has framework list only)

| AI Trust Page | Description | AVA Target | Priority | Effort |
|---------------|-------------|------------|----------|--------|
| `ComplianceChecklist.js` | SR 26-2, ISO 42001, NAIC, CFPB checklists | `/govern/compliance/checklists` | **P1** | Low |
| `ControlsAssessment.js` | Live AWS control scanning | `/govern/compliance/controls` | **P1** | Medium |
| `ControlsLibrary.js` | Control catalog with mappings | `/govern/compliance/library` | P2 | Low |
| `crifsControls.js` | CRI FS Profile controls | Merge into library | P3 | Low |
| `ComplianceConfigurator.js` | Configure compliance rules | `/govern/compliance/config` | P3 | Medium |
| `CustomFrameworks.js` | Create custom frameworks | `/govern/compliance/custom` | P4 | Medium |
| `frameworkObjectives.js` | Framework objective tracking | Merge into checklists | P3 | Low |

**Backend Required:**
- `/api/compliance/checklists` - CRUD for checklist state
- `/api/compliance/controls/scan` - AWS environment scan
- `/api/compliance/evidence` - Evidence attachment

---

### Category: Audit & Incidents (HIGH VALUE - AVA has mock only)

| AI Trust Page | Description | AVA Target | Priority | Effort |
|---------------|-------------|------------|----------|--------|
| `AuditLog.js` | CloudTrail integration for Bedrock events | Wire to `/govern/audit` | **P1** | Medium |
| `IncidentManagement.js` | Log/track/remediate incidents | `/govern/incidents` | **P1** | Medium |
| `AIIncidentPlaybook.js` | Incident response procedures | `/govern/incidents/playbook` | P2 | Low |
| `EvidencePackage.js` | Export evidence for regulators | `/govern/evidence` | P2 | Medium |

**Backend Required:**
- `/api/audit/events` - CloudTrail query (exists in AI Trust)
- `/api/incidents` - CRUD for incidents
- `/api/evidence/export` - Package generation

---

### Category: Agent Management (MEDIUM VALUE - AVA has Frontier Agents)

| AI Trust Page | Description | AVA Target | Priority | Effort |
|---------------|-------------|------------|----------|--------|
| `AgentInventory.js` | Deep Bedrock agent inspection | `/aaas/inventory` | P2 | Medium |
| `AgentRegistry.js` | Combined agents + KBs + runtimes | `/aaas/registry` | P2 | Medium |
| `AgentIdentity.js` | Agent identity management | `/aaas/identity` | P3 | Medium |
| `AgentPolicies.js` | Cedar policy management | `/aaas/policies` | P2 | Medium |
| `AgentPolicyBuilder.js` | Visual policy builder | `/aaas/policies/builder` | P3 | High |
| `AgentSessions.js` | Session tracking | `/aaas/sessions` | P3 | Medium |
| `AgentMemory.js` | Memory inspection | `/aaas/memory` | P3 | Medium |
| `AgentTraceViewer.js` | Trace visualization | `/aaas/traces` | P2 | Medium |
| `AgentWorkflows.js` | Workflow orchestration | `/aaas/workflows` | P3 | High |
| `AgentCostTracker.js` | Per-agent cost tracking | Merge into FinOps | P2 | Low |
| `AgentSecurity.js` | Security posture | `/aaas/security` | P2 | Medium |
| `AgentEvaluation.js` | Agent evaluation | `/aaas/eval` | P2 | Medium |

---

### Category: Evaluation (LOW VALUE - AVA has FSI Foundry focus)

| AI Trust Page | Description | AVA Target | Priority | Effort |
|---------------|-------------|------------|----------|--------|
| `EvaluationStudio.js` | LLM-as-Judge evaluation | `/eval` | P3 | High |
| `EvalBenchmarks.js` | Benchmark management | `/eval/benchmarks` | P3 | Medium |
| `EvalHistory.js` | Historical evaluations | `/eval/history` | P3 | Low |
| `EvalSafety.js` | Safety-focused evaluation | `/eval/safety` | P3 | Medium |
| `EvalDeepDive.js` | Evaluation analysis | `/eval/:id` | P3 | Medium |
| `EvalMethodology.js` | Methodology documentation | Docs | P4 | Low |

---

### Category: Use Case Management (LOW VALUE - AVA has FSI Foundry)

| AI Trust Page | Description | AVA Target | Priority | Effort |
|---------------|-------------|------------|----------|--------|
| `UseCaseRegistry.js` | Use case catalog | Already have FSI Foundry | P4 | - |
| `UseCaseEvaluation.js` | Use case evaluation | Merge into FSI Foundry | P3 | Medium |
| `UseCaseIntakeWizard.js` | New use case intake | `/fsi-foundry/intake` | P3 | Medium |
| `UseCaseApprovals.js` | Approval workflow | `/fsi-foundry/approvals` | P3 | Medium |
| `UseCaseRiskAppetite.js` | Risk appetite per use case | Merge into risk | P3 | Low |
| `UseCaseRegMatrix.js` | Regulatory matrix | `/fsi-foundry/reg-matrix` | P3 | Low |
| `UseCaseCompare.js` | Compare use cases | `/fsi-foundry/compare` | P4 | Medium |
| `UseCaseScenarios.js` | Test scenarios | `/fsi-foundry/scenarios` | P3 | Medium |

---

### Category: Monitoring & Operations (MEDIUM VALUE)

| AI Trust Page | Description | AVA Target | Priority | Effort |
|---------------|-------------|------------|----------|--------|
| `Monitoring.js` | Real-time monitoring dashboard | `/govern/monitoring` | P2 | Medium |
| `DriftDetection.js` | Model/data drift alerts | `/govern/drift` | P2 | Medium |
| `RegressionTesting.js` | Automated regression tests | `/govern/regression` | P3 | Medium |
| `ScaleOperations.js` | Operations at scale | Merge into monitoring | P3 | Medium |

---

### Category: Reporting (LOW VALUE - can add later)

| AI Trust Page | Description | AVA Target | Priority | Effort |
|---------------|-------------|------------|----------|--------|
| `Reports.js` | Report generation | `/reports` | P4 | Medium |
| `BoardPackage.js` | Board-ready package | `/reports/board` | P3 | Medium |
| `RegulatoryCalendar.js` | Regulatory deadlines | `/govern/calendar` | P3 | Low |

---

### Category: Industry-Specific (DEFER - FSI Foundry covers this)

| AI Trust Page | Description | AVA Target | Priority | Effort |
|---------------|-------------|------------|----------|--------|
| `CreditScoring.js` | Credit scoring demo | FSI Foundry use case | P4 | - |
| `FraudDetection.js` | Fraud detection demo | FSI Foundry use case | P4 | - |
| `ClaimsProcessing.js` | Insurance claims demo | FSI Foundry use case | P4 | - |
| `InsuranceUnderwriting.js` | Underwriting demo | FSI Foundry use case | P4 | - |
| `ComplaintManagement.js` | Complaint handling | FSI Foundry use case | P4 | - |
| `ContactCenterAI.js` | Contact center demo | FSI Foundry use case | P4 | - |

---

## Integration Roadmap

### Phase 1: Foundation (Weeks 1-2)
**Goal:** Replace mock data with real capabilities

| # | Feature | Source | Target | Effort |
|---|---------|--------|--------|--------|
| 1.1 | Risk Assessment | `RiskAssessment.js` | `/govern` (replace mock) | 3 days |
| 1.2 | Model Inventory (live) | `ModelInventory.js` | `/govern/models` | 2 days |
| 1.3 | Compliance Checklists | `ComplianceChecklist.js` | `/govern/compliance` | 2 days |
| 1.4 | Audit Log (CloudTrail) | `AuditLog.js` | `/govern/audit` | 3 days |

**Deliverable:** Govern dashboard with real data instead of mock

---

### Phase 2: Differentiation (Weeks 3-4)
**Goal:** Add capabilities AVA doesn't have at all

| # | Feature | Source | Target | Effort |
|---|---------|--------|--------|--------|
| 2.1 | Live Explainability | `LiveExplainability.js` | `/govern/explainability` | 5 days |
| 2.2 | Fair Lending Dashboard | `FairLending.js` | `/govern/fair-lending` | 4 days |
| 2.3 | Bias Monitoring | `BiasMonitoring.js` | `/govern/bias` | 3 days |
| 2.4 | Incident Management | `IncidentManagement.js` | `/govern/incidents` | 3 days |

**Deliverable:** Unique explainability and fair lending capabilities

---

### Phase 3: Depth (Weeks 5-6)
**Goal:** Add depth to existing features

| # | Feature | Source | Target | Effort |
|---|---------|--------|--------|--------|
| 3.1 | Model 360 | `Model360.js` | `/govern/models/:id` | 3 days |
| 3.2 | Model Lifecycle | `ModelLifecycle.js` | `/govern/models/lifecycle` | 3 days |
| 3.3 | Controls Assessment | `ControlsAssessment.js` | `/govern/controls` | 4 days |
| 3.4 | Evidence Package | `EvidencePackage.js` | `/govern/evidence` | 3 days |

**Deliverable:** Deep model governance and evidence export

---

### Phase 4: Agent Governance (Weeks 7-8)
**Goal:** Govern the agent fleet

| # | Feature | Source | Target | Effort |
|---|---------|--------|--------|--------|
| 4.1 | Agent Inventory | `AgentInventory.js` | `/aaas/inventory` | 4 days |
| 4.2 | Agent Policies | `AgentPolicies.js` | `/aaas/policies` | 4 days |
| 4.3 | Agent Trace Viewer | `AgentTraceViewer.js` | `/aaas/traces` | 3 days |
| 4.4 | Agent Cost Tracker | `AgentCostTracker.js` | Merge into FinOps | 2 days |

**Deliverable:** Complete agent governance suite

---

## Technical Migration Notes

### Styling Migration (BlueprintJS → Tailwind)

```jsx
// BlueprintJS (AI Trust Platform)
<Card elevation={2} className="p-4">
  <H4>Title</H4>
  <Tag intent="success">Active</Tag>
  <Button intent="primary" onClick={...}>Action</Button>
</Card>

// Tailwind (AVA Platform)
<div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
  <h4 className="text-lg font-semibold text-slate-900">Title</h4>
  <span className="px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-full">Active</span>
  <button className="btn-primary" onClick={...}>Action</button>
</div>
```

### Common Pattern Mappings

| BlueprintJS | Tailwind Equivalent |
|-------------|---------------------|
| `<Card elevation={2}>` | `className="bg-white rounded-xl border shadow-sm"` |
| `<Tag intent="success">` | `className="bg-emerald-50 text-emerald-700 ..."` |
| `<Tag intent="warning">` | `className="bg-amber-50 text-amber-700 ..."` |
| `<Tag intent="danger">` | `className="bg-rose-50 text-rose-700 ..."` |
| `<Button intent="primary">` | `className="btn-primary"` |
| `<Callout intent="warning">` | `className="p-4 bg-amber-50 border border-amber-200 rounded-lg"` |
| `<Spinner />` | `className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin"` |
| `<H3>`, `<H4>` | `className="text-lg font-semibold"` |

### Shared Dependencies (no changes needed)
- `recharts` - Same version, same API
- `react-router-dom` - Same patterns
- `date-fns` - Date formatting

### Backend API Endpoints to Port

```
# Explainability
POST /api/explain                    # LIME explanation
POST /api/explain/counterfactual     # What-if analysis
POST /api/explain/adverse-action     # ECOA letter generation

# Fair Lending
GET  /api/fairlending/metrics        # Protected class metrics
POST /api/fairlending/test           # Run bias tests

# Models
GET  /api/bedrock/models             # List models (live)
GET  /api/bedrock/models/:id         # Model details
GET  /api/models/lifecycle           # Lifecycle status

# Audit
GET  /api/audit/events               # CloudTrail events
POST /api/incidents                  # Create incident
GET  /api/incidents                  # List incidents

# Compliance
GET  /api/compliance/checklists      # Get checklists
PUT  /api/compliance/checklists/:id  # Update checklist
POST /api/compliance/controls/scan   # Scan AWS environment
```

---

## File-to-Route Mapping Summary

| AI Trust Platform File | AVA Route | Priority |
|------------------------|-----------|----------|
| `LiveExplainability.js` | `/govern/explainability` | P1 |
| `FairLending.js` | `/govern/fair-lending` | P1 |
| `BiasMonitoring.js` | `/govern/bias` | P1 |
| `RiskAssessment.js` | `/govern` (replace section) | P1 |
| `AuditLog.js` | `/govern/audit` | P1 |
| `IncidentManagement.js` | `/govern/incidents` | P1 |
| `ModelInventory.js` | `/govern/models` | P1 |
| `ComplianceChecklist.js` | `/govern/compliance` | P1 |
| `Model360.js` | `/govern/models/:id` | P2 |
| `ModelLifecycle.js` | `/govern/models/lifecycle` | P2 |
| `ControlsAssessment.js` | `/govern/controls` | P2 |
| `EvidencePackage.js` | `/govern/evidence` | P2 |
| `AgentInventory.js` | `/aaas/inventory` | P2 |
| `AgentPolicies.js` | `/aaas/policies` | P2 |
| `AgentTraceViewer.js` | `/aaas/traces` | P2 |
| `AdvancedExplainability.js` | `/govern/explainability/advanced` | P2 |
| `ModelRiskManagement.js` | `/govern/mrm` | P2 |
| `Monitoring.js` | `/govern/monitoring` | P2 |
| `DriftDetection.js` | `/govern/drift` | P2 |
| `RAIAssessmentWizard.js` | `/govern/rai` | P3 |
| `UseCaseIntakeWizard.js` | `/fsi-foundry/intake` | P3 |
| `BoardPackage.js` | `/reports/board` | P3 |

---

## Success Metrics

After integration, AVA Trust Stack should improve:

| Layer | Current | Target | Key Additions |
|-------|---------|--------|---------------|
| Layer 1 | 75% | 85% | Tools factory wiring |
| Layer 2 | 85% | 95% | Live model registry, custom agent deploy |
| Layer 3 | 45% | 90% | Explainability, fair lending, live audit |
| **Overall** | **68%** | **90%** | |

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Prioritize** based on customer/demo needs
3. **Start Phase 1** with RiskAssessment.js port (lowest risk, high visibility)
4. **Set up shared component library** for migrated components
5. **Create backend API spec** for required endpoints

---

## Appendix: AI Trust Platform Page Index

<details>
<summary>All 95+ pages categorized</summary>

### Explainability (5)
- Explainability.js
- AdvancedExplainability.js
- LiveExplainability.js
- ExplanationEvaluator.js
- XAIGallery.js

### Fair Lending & Bias (3)
- FairLending.js
- BiasMonitoring.js
- FairLendingAndBias.js

### Risk & Assessment (5)
- RiskAssessment.js
- RAIAssessmentWizard.js
- RAIPortfolioHeatmap.js
- RAIRiskRating.js
- TrustAssessment.js

### Model Management (6)
- ModelInventory.js
- Model360.js
- ModelLifecycle.js
- ModelRegistry.js
- ModelComparison.js
- ModelPerformance.js
- ModelRiskManagement.js

### Compliance & Controls (6)
- ComplianceChecklist.js
- ControlsAssessment.js
- ControlsLibrary.js
- crifsControls.js
- ComplianceConfigurator.js
- CustomFrameworks.js
- frameworkObjectives.js

### Audit & Incidents (4)
- AuditLog.js
- IncidentManagement.js
- AIIncidentPlaybook.js
- EvidencePackage.js

### Agent Management (14)
- AgentInventory.js
- AgentRegistry.js
- AgentRegistryBrowser.js
- AgentIdentity.js
- AgentPolicies.js
- AgentPolicyBuilder.js
- AgentSessions.js
- AgentMemory.js
- AgentTraceViewer.js
- AgentWorkflows.js
- AgentCostTracker.js
- AgentSecurity.js
- AgentEvaluation.js
- AgentAssistant.js
- MultiCloudAgents.js

### Evaluation (7)
- Evaluation.js
- EvaluationStudio.js
- EvaluationDetails.js
- EvalBenchmarks.js
- EvalHistory.js
- EvalSafety.js
- EvalDeepDive.js
- EvalMethodology.js

### Use Case Management (12)
- UseCaseRegistry.js
- UseCaseEvaluation.js
- UseCaseAutoEval.js
- UseCaseIntakeWizard.js (component)
- UseCaseApprovals.js (component)
- UseCaseRiskAppetite.js
- UseCaseRegMatrix.js
- UseCaseCompare.js
- UseCaseScenarios.js
- UseCaseConditions.js
- UseCaseImpact.js
- UseCaseExecutiveBrief.js (component)

### Monitoring & Operations (5)
- Monitoring.js
- DriftDetection.js
- RegressionTesting.js
- ScaleOperations.js
- DecisionPipeline.js

### Data & Datasets (4)
- Datasets.js
- DatasetDetail.js
- DataSensitivity.js
- DataSensitivityExtras.js

### Governance & Policy (4)
- GovernanceDashboard.js
- GovEnterpriseDashboard.js
- GovPolicyEngine.js
- ServiceApproval.js

### Guardrails (2)
- GuardrailsManager.js
- GuardrailsExtras.js

### Reporting (3)
- Reports.js
- BoardPackage.js
- RegulatoryCalendar.js

### Security & Testing (4)
- PipelineSecurity.js
- RedTeaming.js
- ThreatTesting.js
- TestCaseExplorer.js

### Industry Demos (6)
- CreditScoring.js
- FraudDetection.js
- ClaimsProcessing.js
- InsuranceUnderwriting.js
- ComplaintManagement.js
- ContactCenterAI.js

### Infrastructure (5)
- ArchitectureDiagrams.js
- KBInventory.js
- RagAnalysis.js
- Personas.js
- PlatformAdmin.js

### Other (5)
- AnalyticsPro.js
- DemoSimulator.js
- ScopingMatrixView.js
- ScopingObservability.js
- UnifiedTimeline.js

</details>
