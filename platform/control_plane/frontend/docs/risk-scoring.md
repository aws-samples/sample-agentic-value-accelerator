# Model Risk Scoring Framework

This document describes the risk tier calculation methodology used in the Model Risk Management (MRM) module of the AVA Governance platform.

## Overview

Models in the registry are classified into four risk tiers based on their **inherent risk score** (0-100). The tier determines governance requirements including revalidation frequency, control requirements, and human oversight needs.

## Risk Tier Thresholds

| Tier | Score Range | Revalidation | HITL Required | EU AI Act |
|------|-------------|--------------|---------------|-----------|
| **Critical** | 75-100 | 60 days | Yes | High Risk (Art. 6) |
| **High** | 50-74 | 90 days | Yes | High Risk (Art. 6) |
| **Medium** | 25-49 | 180 days | No | Limited Risk (Art. 52) |
| **Low** | 0-24 | 365 days | No | Minimal Risk |

## Inherent Risk Score Calculation

The inherent risk score is computed from four dimensions, each contributing up to 25 points (total max: 100):

### 1. Use Case Criticality (0-25 points)

| Level | Points | Description |
|-------|--------|-------------|
| Financial Decision-Making | 25 | Lending, trading, underwriting decisions |
| Regulatory/Compliance | 20 | BSA/AML, fraud detection, regulatory reporting |
| Customer-Facing Consequential | 15 | Claims adjudication, account actions |
| Internal Operations | 10 | Process automation, document processing |
| Low-Stakes Classification | 5 | Routing, triage, information lookup |

### 2. Data Sensitivity (0-25 points)

| Level | Points | Description |
|-------|--------|-------------|
| PHI/HIPAA | 25 | Protected health information |
| PII/Financial | 20 | SSN, account numbers, credit data |
| Confidential Business | 15 | Trade secrets, strategy, internal financials |
| Internal Only | 10 | Internal communications, operational data |
| Public Data | 5 | Publicly available information only |

### 3. Autonomy Level (0-25 points)

| Level | Points | Description |
|-------|--------|-------------|
| Fully Autonomous | 25 | Executes decisions without human approval |
| Autonomous with Escalation | 20 | Autonomous for normal cases, escalates exceptions |
| Human-in-the-Loop | 15 | All decisions require human approval |
| Advisory Only | 10 | Provides recommendations, human decides |
| Information Retrieval | 5 | Retrieves/summarizes information only |

### 4. Model Complexity (0-25 points)

| Level | Points | Description |
|-------|--------|-------------|
| Agentic/Multi-Step | 25 | Multi-agent orchestration, tool use, planning |
| Complex Reasoning | 20 | Extended thinking, complex analysis (Opus-class) |
| Standard Reasoning | 15 | General-purpose reasoning (Sonnet-class) |
| Simple Tasks | 10 | Classification, extraction (Haiku-class) |
| Deterministic | 5 | Rule-based, templated responses |

## Residual Risk Calculation

Residual risk represents the risk remaining after control mitigations are applied:

```
Residual Score = Inherent Score - Σ(Active Control Mitigations)
```

Each control has a `mitigation` value representing how many points it reduces from the inherent score. Only controls with `status: 'active'` contribute to the reduction.

### Example

```typescript
// Model with inherent score of 74 (High tier)
const inherentScore = 74;

const controls = [
  { name: 'Advanced guardrails', mitigation: 14, status: 'active' },
  { name: 'Real-time anomaly detection', mitigation: 10, status: 'active' },
  { name: 'Human-in-the-loop', mitigation: 8, status: 'active' },
  { name: 'Continuous monitoring', mitigation: 4, status: 'active' },
];

// Total active mitigation: 14 + 10 + 8 + 4 = 36
// Residual score: 74 - 36 = 38 (Medium tier)
```

## Residual Risk Acceptance Criteria

For models to be approved for production:

| Inherent Tier | Required Residual Tier |
|---------------|------------------------|
| Critical | Must reduce to Medium or Low |
| High | Must reduce to Medium or Low |
| Medium | No reduction requirement |
| Low | No reduction requirement |

## Risk Reduction Percentage

The risk reduction percentage shows the effectiveness of controls:

```
Reduction % = ((Inherent Score - Residual Score) / Inherent Score) × 100
```

## Regulatory Alignment

This framework aligns with:

- **SR 26-2 (US Fed)**: Model risk tiering with proportionate controls
- **OSFI E-23 (Canada)**: Materiality-based governance (Tier 1/2/3 mapping)
- **NIST AI RMF**: Risk mapping and measurement functions
- **EU AI Act**: Risk classification (Critical/High maps to "High Risk AI Systems")

## Code Reference

The risk scoring logic is implemented in:

```
frontend/src/components/govern/riskScoring.ts
```

Key functions:

| Function | Description |
|----------|-------------|
| `getRiskTierFromScore(score)` | Returns tier name from numeric score |
| `getRiskTierConfig(score)` | Returns full tier configuration |
| `calculateInherentRiskScore(dimensions)` | Computes inherent score from dimension inputs |
| `calculateResidualRiskScore(inherent, controls)` | Computes residual after controls |
| `isResidualRiskAcceptable(inherent, residual)` | Validates acceptance criteria |
| `getRevalidationDate(tier, lastDate)` | Calculates next revalidation due date |

## Configuration

Risk tier thresholds can be adjusted in the `RISK_TIER_CONFIG` array in `riskScoring.ts`. Changes affect:

- Tier classification thresholds
- Revalidation frequencies
- HITL requirements
- EU AI Act classification mapping

## Usage in UI

The Model Registry (`ModelRegistry.tsx`) displays:

- Portfolio risk distribution (inherent vs residual)
- Scatter plot showing risk reduction per model
- Control gap alerts for models not meeting tier requirements

The Model Drawer (`ModelDrawer.tsx`) shows per-model:

- Inherent and residual risk with tier badges
- Control effectiveness breakdown
- Revalidation status based on tier frequency
