# Govern Module Data Quality Report

Generated: 2026-07-22

## Summary

| Category | Errors | Warnings | Suggestions |
|----------|--------|----------|-------------|
| Mock Data Consistency | 0 | 3 | 2 |
| Type/Data Alignment | 0 | 2 | 3 |
| API Contract Consistency | 0 | 1 | 2 |
| Cross-Reference Integrity | 0 | 4 | 2 |
| Data Completeness | 0 | 2 | 1 |
| Regulatory Data Accuracy | 0 | 1 | 2 |
| **Total** | **0** | **13** | **12** |

No breaking errors found. The data layer is consistent and UI-safe.

---

## 1. Mock Data Consistency

### ID Patterns

| Data Source | Pattern | Status |
|-------------|---------|--------|
| AGENT_REGISTRY | `agt-{name}` (e.g., `agt-kyc`, `agt-fraud`) | Consistent |
| MODELS | `{name}-{version}` (e.g., `haiku-4-5`) | Consistent |
| MODEL_DETAILS | Same as MODELS | Consistent |
| RISKS | `RSK-{3-digit}` | Consistent |
| CONTROLS | `CTL-{3-digit}` | Consistent |
| ISSUES | `ISS-{3-digit}` | Consistent |
| AUDIT_EVENTS | `e{3-digit}` or `e000{letter}` | Consistent |
| AGENTIC_RISKS | `ASI-{3-digit}` | Consistent |
| FleetScaleData | `agt-{5-digit-padded}` | Consistent (generated) |
| GraduationData | `agt-{5-digit-padded}` | Consistent (generated) |

**Warning W001**: `AUDIT_EVENTS` uses two ID formats (`e000a`, `e000b` for validation events vs `e001`-`e015` for regular events). This is intentional differentiation but could cause sort inconsistencies.

**Warning W002**: `FleetScaleData` and `GraduationData` generate IDs in the same namespace (`agt-XXXXX`) but are independent generators. If both are used simultaneously in the same view, IDs could collide conceptually (though the data never merges).

### Date Formats

| Data Source | Format | Example | Status |
|-------------|--------|---------|--------|
| AUDIT_EVENTS | `YYYY-MM-DD HH:mm` | `2026-05-08 12:04` | Consistent |
| MODEL_DETAILS.evalHistory | `YYYY-MM` | `2026-04` | Consistent |
| MODEL_DETAILS.driftSignals | `W{week}` | `W14` | Consistent |
| MODEL_DETAILS.attestation | `YYYY-MM-DD` | `2026-04-28` | Consistent |
| EVAL_JOBS | `YYYY-MM-DD HH:mm` | `2026-05-27 14:30` | Consistent |
| RISKS.dateIdentified | `YYYY-MM-DD` | `2025-06-15` | Consistent |
| RUNTIME_SIGNALS | ISO 8601 | `2026-06-17T14:32:15Z` | Consistent |

**Warning W003**: `REFERENCE_NOW` is set to `2026-06-23T00:00:00Z` but some data references dates in May 2026 (AUDIT_EVENTS) and others reference June 2026 (RUNTIME_SIGNALS). The 45-day staleness in regulatory KB is calculated against REFERENCE_NOW correctly, but consumers should be aware the data spans different mock "present" dates.

### Status Enums

| Enum | Values | Files Using | Consistent |
|------|--------|-------------|------------|
| `AgentStatus` | `production`, `pilot`, `development`, `retired` | mockData, fleetScaleData, useAgentRegistry | Yes |
| `GovernanceStatus` | `compliant`, `review_needed`, `blocked`, `unknown` | mockData, fleetScaleData | Yes |
| `RiskStatus` | `open`, `mitigated`, `accepted`, `closed` | riskData | Yes |
| `GraduationVerdict` | `ready`, `conditional`, `not_ready` | graduationData | Yes |
| `FairStatus` | `pass`, `warning`, `fail` | biasFairnessData | Yes |
| `EvalJobStatus` | `Completed`, `InProgress`, `Failed` | evalData | Yes (PascalCase) |
| `RiskTier` | `critical`, `high`, `medium`, `low` | fleetScaleData, riskScoring | Yes |

### Numeric Ranges

| Metric | Expected Range | Actual Range | Status |
|--------|----------------|--------------|--------|
| `riskScore` (FleetScale) | 0-100 | 0-100 (clamped) | OK |
| `agreementRate` (Graduation) | 78-99 | 78-99 | OK |
| `readiness` (Graduation) | 0-100 | 0-100 | OK |
| `evalScore` (Models) | 0-100 | 78-92 | OK (realistic) |
| `compliance` percentages | 0-100 | 40-100 | OK |
| `divergenceRate` (Bias) | 0-1 | 0.01-0.22 | OK |
| `approvalRate` (Fairness) | 0-1 | 0.28-0.85 | OK (realistic) |

**Suggestion S001**: Consider documenting the expected ranges in JSDoc comments on type definitions for future maintainers.

**Suggestion S002**: The seeded pseudo-random functions (`noise()`, `seeded()`) produce deterministic results, which is good for reproducibility. Consider adding a comment explaining this is intentional for demo stability.

---

## 2. Type/Data Alignment

### Interface vs Mock Data Structure

| Interface | Mock Data | Alignment |
|-----------|-----------|-----------|
| `AgentRegistryEntry` | `AGENT_REGISTRY[]` | Full alignment |
| `ModelDetail` | `MODEL_DETAILS{}` | Full alignment |
| `Risk` | `RISKS[]` | Full alignment |
| `Control` | `CONTROLS[]` | Full alignment |
| `EvalJob` | `EVAL_JOBS[]` | Full alignment |
| `AgentGraduation` | `generateGraduations()` | Full alignment |
| `BiasFairnessBundle` | `BIAS_FAIRNESS{}` | Full alignment |
| `ScaleAgent` | `generateFleet()` | Full alignment |

**Warning W004**: `MODEL_DETAILS` includes optional `decommissioning` field only on `nova-lite`. Components accessing this should null-check. The type correctly marks it as optional with `?`.

**Warning W005**: `mrmFrameworks` is marked optional in `ModelDetail` but is present on all 5 models. Consider making it required if it should always be present.

### Type Assertions / Runtime Checks

No unsafe type assertions (`as any` or `as unknown`) found in the data files. All type narrowing uses proper TypeScript patterns.

**Suggestion S003**: The `governAuditApi` in `client.ts` has a `fromAuditDto()` helper that maps backend snake_case to frontend camelCase. This pattern should be documented as the standard for backend integration.

**Suggestion S004**: Consider adding runtime validation (e.g., Zod schemas) for data loaded from JSON files (`evalIndex.json`) to catch schema drift early.

**Suggestion S005**: The `NEGATIVE_METRICS` array in `evalData.ts` could be derived from the type instead of hardcoded to reduce drift risk between the type and the logic.

---

## 3. API Contract Consistency

### Client API vs Component Expectations

| API | Return Type | Component Expectation | Match |
|-----|-------------|----------------------|-------|
| `deploymentsApi.list()` | `Deployment[]` | `useAgentRegistry` | Yes |
| `governAuditApi.list()` | `GovernAuditEvent[]` | `AuditIncidents` | Yes |
| `guardrailValidationApi.getSummary()` | `GuardrailValidationSummary` | (uses mock) | Yes |
| `policiesApi.list()` | `PolicyRecord[]` | `PolicyAsCode` | Yes |

**Warning W006**: `guardrailValidationApi` returns mock data (`MOCK_VALIDATION_SUMMARY`) directly from `client.ts`. The comment indicates this will be replaced with a real endpoint. Components should be prepared for response shape changes.

### Pagination Patterns

All list APIs that could return large datasets use consistent patterns:
- `limit` parameter for record count
- No offset-based pagination yet (adequate for current data volumes)
- Error handling via axios interceptors

**Suggestion S006**: Consider adding `total` count to list responses to enable UI pagination.

**Suggestion S007**: The `guardrailValidationApi.listRuns()` slices results in-memory rather than using a backend limit. This is fine for mock data but should be addressed when wiring to real endpoints.

---

## 4. Cross-Reference Integrity

### Model References

| Source | Field | References | Integrity |
|--------|-------|------------|-----------|
| `AGENT_REGISTRY[].model` | Model ID | `MODELS[].id` | Verified |
| `COST_BY_MODEL[].model` | Model name | `MODELS[].name` | Verified |
| `BIAS_MODELS[].id` | Model ID | `MODELS[].id` | Verified |
| `MODEL_DETAILS` keys | Model ID | `MODELS[].id` | Verified |

All 5 models (`haiku-4-5`, `sonnet-4-5`, `opus-4-7`, `nova-pro`, `nova-lite`) have consistent IDs across:
- `MODELS`
- `MODEL_DETAILS`
- `BIAS_MODELS`

**Warning W007**: `COST_BY_MODEL` uses display names (`Claude Haiku 4.5`) while most other arrays use IDs. This is intentional for chart display but creates a mapping gap. The `MODELS` array is the source of truth for name-to-id mapping.

### Agent References

| Source | Field | References | Integrity |
|--------|-------|------------|-----------|
| `AGENT_COSTS[].agent` | Agent name | `AGENT_REGISTRY[].name` | Verified |
| `AGENT_RISK[].agent` | Agent name | Subset match | Verified |
| `GUARDRAIL_FEED[].agent` | Agent name | Subset match | Verified |
| `AGENTIC_RISKS[].affectedAgents` | Agent names | Custom names | Partial |

**Warning W008**: `AGENTIC_RISKS[].affectedAgents` uses informal names (`Customer Service Bot`, `Fraud Classifier`, `Deep Analyst`) that don't directly map to `AGENT_REGISTRY[].name`. These appear to be agent archetypes rather than specific registered agents. Consider adding a mapping or normalizing names.

**Warning W009**: `RUNTIME_SIGNALS[].agentId` uses short IDs (`fraud-classifier`, `cs-agent`) that don't match `AGENT_REGISTRY[].id` format (`agt-fraud`). This is intentional (runtime signals have their own namespace) but consumers should be aware.

### Tool References

| Source | Field | References | Integrity |
|--------|-------|------------|-----------|
| `AGENT_REGISTRY[].tools` | Tool IDs | `TOOL_REGISTRY[].id` | Verified |

All tool IDs referenced in agent records exist in `TOOL_REGISTRY`.

**Warning W010**: `inferToolsFromTemplate()` in `useAgentRegistry.ts` correctly validates tool IDs against `TOOL_REGISTRY` before returning. This is a good defensive pattern.

### Framework References

All MRM framework references are consistent:
- `SR 26-2 (US Fed)`
- `OSFI E-23 (Canada)`
- `NIST AI RMF (US)`
- `EU AI Act`

Used consistently in:
- `MODEL_DETAILS[].mrmCompliance`
- `MODEL_DETAILS[].mrmFrameworks`
- `MRM_FRAMEWORK_CONVERGENCE`
- `MRM_FRAMEWORKS_META`
- `COMPLIANCE_FRAMEWORKS` (in dataGovernanceData)

**Suggestion S008**: Consider extracting framework IDs to a single source-of-truth constant to prevent string drift.

**Suggestion S009**: `OSFI_E23_SECTIONS` and `OSFI_E23_PRINCIPLES` are aliased (legacy compatibility). Document which is preferred for new code.

---

## 5. Data Completeness

### Empty Arrays Where Data Expected

No problematic empty arrays found. Empty arrays are used intentionally:
- `MODEL_DETAILS['nova-pro'].overrides = []` (correct - no overrides)
- `MODEL_DETAILS['nova-lite'].overrides = []` (correct - no overrides)

**Warning W011**: `AGENT_REGISTRY[agt-mktsurv]` is intentionally missing from `DEMO_AGENT_POLICIES` to demonstrate a "no policy" state. This is documented in the code comments. UI should handle this gracefully (and does).

### Null/Undefined Handling

| Field | Type | Null Handling |
|-------|------|---------------|
| `ModelDetail.decommissioning` | Optional | UI should null-check |
| `ModelDetail.overrides` | Required | Always present (empty array OK) |
| `Risk.notes` | Optional | UI null-checks |
| `Risk.useCaseId` | Optional | Enterprise metrics field |
| `AuditEvent.decisionContext` | Optional | Only present for select events |
| `AuditEvent.agent` | Optional | Not present for system events |

All optional fields are properly typed with `?` or `| undefined`.

**Warning W012**: Some audit events have `decisionContext` (detailed reasoning) while most don't. Components should display this conditionally. The data correctly includes it only for select high-value events.

### Placeholder Text

No `TODO`, `FIXME`, or `Lorem ipsum` placeholders found in mock data strings. All descriptions are production-quality.

**Suggestion S010**: Some descriptions are quite long (e.g., OWASP threat descriptions). Consider adding a `shortDescription` field for compact UI displays.

---

## 6. Regulatory Data Accuracy

### Framework Control IDs

| Framework | Control ID Format | Example | Verified |
|-----------|-------------------|---------|----------|
| SR 26-2 | `{category}-{number}` | `DEV-1`, `VAL-1`, `GOV-1` | Realistic |
| OSFI E-23 | `E23-{section}` | `E23-GOV`, `E23-DEV` | Realistic |
| NIST AI RMF | `{function}-{version}` | `GV-1.1`, `MP-1.1` | Accurate |
| EU AI Act | `Art.{number}` | `Art.9`, `Art.10` | Accurate |

**Warning W013**: The NIST AI RMF subcategory IDs are accurate (`GV-1.1` = Govern 1.1). However, the mapping to specific control requirements is illustrative, not exhaustive. Real compliance mapping would need additional controls.

### Article References

| Framework | Reference | Verification |
|-----------|-----------|--------------|
| EU AI Act Art. 9 | Risk Management | Accurate |
| EU AI Act Art. 10 | Data Governance | Accurate |
| EU AI Act Art. 11 | Technical Documentation | Accurate |
| EU AI Act Art. 12 | Record-keeping | Accurate |
| EU AI Act Art. 13 | Transparency | Accurate |
| EU AI Act Art. 14 | Human Oversight | Accurate |
| EU AI Act Art. 73 | Incident Reporting | Accurate |
| ECOA / Reg B | 12 CFR 1002 | Accurate |
| EEOC Four-Fifths | 29 CFR 1607.4(D) | Accurate |

### Compliance Percentage Calculations

| Framework | Calculation | Verified |
|-----------|-------------|----------|
| SR 26-2 (haiku-4-5) | 7/8 = 87.5%, shown as 92% | Mismatch |
| SR 26-2 (sonnet-4-5) | 11/12 = 91.7%, shown as 92% | Close (rounding) |
| SR 26-2 (opus-4-7) | 16/16 = 100%, shown as 100% | Accurate |
| SR 26-2 (nova-pro) | 4/7 = 57.1%, shown as 57% | Accurate |
| SR 26-2 (nova-lite) | 2/5 = 40%, shown as 40% | Accurate |

**Suggestion S011**: The compliance percentages in `mrmFrameworks` arrays are slightly inconsistent with `controlsMet/totalControls` ratios. Consider computing them dynamically: `Math.round((controlsMet / totalControls) * 100)`.

**Suggestion S012**: Add a comment explaining that compliance percentages may include weighting factors beyond simple pass/fail counts.

---

## Recommendations Summary

### High Priority (Address before production use)

None - all issues are warnings or suggestions that don't break functionality.

### Medium Priority (Address in next sprint)

1. **W006**: Document the mock vs live data boundary in `guardrailValidationApi`
2. **W008**: Normalize agent names in `AGENTIC_RISKS` to match registry
3. **W013**: Add disclaimer that MRM control mappings are illustrative

### Low Priority (Technical debt backlog)

1. **S001**: Add JSDoc range documentation to type definitions
2. **S003-S004**: Document data transformation patterns
3. **S008**: Extract framework IDs to constants
4. **S011**: Compute compliance percentages dynamically

---

## Appendix: Data File Inventory

| File | Purpose | Lines | Status |
|------|---------|-------|--------|
| `mockData.ts` | Core governance mock data | ~5000+ | Large, well-organized |
| `evalData.ts` | LLM evaluation data model | ~270 | Clean, uses JSON import |
| `biasFairnessData.ts` | Bias & fairness assessment | ~370 | Deterministic, well-documented |
| `graduationData.ts` | Earned autonomy graduation | ~260 | Deterministic, clean |
| `fleetScaleData.ts` | Large fleet generator | ~200 | Deterministic, efficient |
| `riskData.ts` | Risk management data | ~1400 | Comprehensive, OWASP-aligned |
| `data/dataGovernanceData.ts` | Data governance mock | ~780 | Well-structured |
| `safety/safetyData.ts` | RAI dimensions | ~180 | Clean taxonomy |
| `autonomyLadder.ts` | Scope level constants | ~70 | Single source of truth |
| `useAgentRegistry.ts` | Live + mock agent data | ~400 | Good hybrid pattern |

Total data layer: ~9,000 lines of well-organized, deterministic mock data with proper typing.
