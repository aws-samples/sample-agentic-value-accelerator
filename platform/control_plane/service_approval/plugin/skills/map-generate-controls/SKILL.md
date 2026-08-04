---
name: map-generate-controls
description: Generate security controls from mitigations x capabilities, organized by Category x Scope matrix. Produces map-controls-generated.json with rich metadata for downstream framework mapping. Consumes validated.json.
disable-model-invocation: false
argument-hint: '[--service=<name>] [--include-unverified]'
---

# Service Approval — Map: Generate Controls

Using the mitigation inventory and verified service capabilities, generate security controls
organized by the Category x Scope matrix. Each control traces back to mitigation(s) and
includes rich metadata so downstream skills (framework-mapping, generate) can work without
re-deriving the reasoning chain.

**Input:** `.service-approval/<slug>/03-validate/validated.json`
**Output:** `.service-approval/<slug>/04-map/map-controls-generated.json`
**Schema:** `schemas/map-controls-generated.schema.json` — encodes shape, id pattern `^CTRL-(ORG|ACC|RES)-(PRO|PRV|DET|COR)-\d{3}$`, scope/category enums, `mitigation_ids[]` pattern `^M-.+`, per-control required fields.

This is one of 4 focused map sub-skills. Each writes to a separate intermediate state file.

---

## Prerequisites

```bash
test -f .service-approval/<slug>/03-validate/validated.json && echo "validated: OK" || echo "ERROR: run validator first"
mkdir -p .service-approval/<slug>/04-map
```

Load validated.json and extract:
```bash
python3 -c "
import json
vj = json.load(open('.service-approval/<slug>/03-validate/validated.json'))
print(f'Assets: {len(vj[\"assets\"])}')
print(f'Operations: {len(vj[\"api_surface\"][\"operations\"])}')
print(f'Mitigations: {len(vj[\"existing_mitigations\"])}')
print(f'Condition keys: {len(vj[\"capabilities\"][\"iam\"][\"condition_keys\"])}')
gaps = vj.get('assessment_gaps', [])
print(f'Assessment gaps: {len(gaps)}')
print(f'SCP: {vj[\"capabilities\"][\"organization_policies\"][\"scp\"][\"supported\"]}')
print(f'RCP: {vj[\"capabilities\"][\"organization_policies\"].get(\"rcp\", {}).get(\"supported\", False)}')
"
```

---

## Phase 1: Build Mitigation Index

For each mitigation in `existing_mitigations[]`, build a rich index:

```json
{
  "id": "M-<Resource>.0",
  "statement": "...",
  "mitigation_goal": "...",
  "request_parameters": ["$.encryptionKeyArn", "$.executionRoleArn"],
  "resource_type": "AWS::<Service>::<Resource>",
  "verified": true,
  "verification_note": "..."
}
```

Group mitigations by `resource_type` for efficient lookup during control generation.

### Cross-reference with assessment gaps

If `assessment_gaps[]` exists in validated.json:
- For each gap with `status` = `REQUIREMENT GAP` or `CUSTOMER ACTION REQUIRED`:
  - Check if any existing mitigation addresses this gap
  - If not, flag as `unaddressed_gap` — must generate controls for it

---

## Phase 2: Generate Controls

For each mitigation, generate controls using the Category x Scope matrix.

### 2.1 Control generation logic

For each mitigation:
1. Read the `mitigation_goal` — defines WHAT needs to be controlled
2. Read `request_parameters[]` — the API parameters that enforce the control
3. Look up the corresponding capability in `capabilities{}` — defines HOW the service supports it
4. Generate one or more controls that enforce the mitigation goal using available capabilities
5. Write the **security_rationale** — a 2-3 sentence explanation of WHY this control is the right
   mechanism for this mitigation, including the reasoning chain from mitigation goal to enforcement
   mechanism. This rationale is consumed by map-framework-mapping to make informed mapping decisions.

**CRITICAL — Condition key action applicability:**

When assigning `condition_keys` and `actions` to a control, verify that each condition key
actually applies to the specified actions. The SAR page defines which condition keys work with
which actions — a condition key used in an SCP/IAM Deny on an action it doesn't apply to will
be silently ignored by IAM, making the control ineffective.

Before assigning a condition key to a control:
1. Look up the key in `capabilities.iam.condition_keys[]`
2. Read its `applies_to_actions[]` list
3. Confirm that EVERY action in the control's `actions[]` appears in `applies_to_actions[]`
4. If the action is NOT in `applies_to_actions[]`, do NOT use that condition key for that action.
   Instead, find an alternative enforcement mechanism (resource policy, Config rule, etc.)

Common error: using a resource-type-specific condition key (e.g., one that applies to Gateway
operations) on a different resource type's actions (e.g., Runtime). Each resource type may have
different applicable condition keys.

### 2.2 Control sources to enumerate

- **IAM controls** — from `capabilities.iam` (condition keys, resource policies, permission boundaries, SCPs)
- **Encryption controls** — from `capabilities.encryption` (KMS CMK, SSE, TLS, key rotation)
- **Network controls** — from `capabilities.network` (VPC, endpoints, PrivateLink, security groups)
- **Logging controls** — from `capabilities.logging` (CloudTrail, CloudWatch, data events)
- **Configuration controls** — from `capabilities.config` (Config rules, conformance packs)
- **Organization policy controls** — from `capabilities.organization_policies` (SCPs, RCPs, declarative policies)
- **Tagging controls** — tag policies, required tags
- **Availability controls** — backup, multi-AZ, lifecycle
- **AI-specific controls** — guardrails, prompt validation (if applicable)

### 2.2.1 Rule C1 — Posture × feasibility filter (REQUIRED)

Before assigning mechanisms, classify each mitigation's **posture** and verify mechanism
**feasibility** against the parameter's `gateable_by` and `mutability` fields in
`validated.json.api_surface.operations[].parameters[]`. A critical mitigation produces
controls at multiple postures (defense-in-depth) — one control per feasible posture.

**Posture values:**
- `preventative-request` — AWS IAM evaluates the condition at request time (SCP, RCP, IAM
  policy, trust policy, permission boundary, KMS key policy, resource-based policy, VPCE
  policy). Requires `"sar"` in the parameter's `gateable_by[]`.
- `preventative-proactive` — IaC/CI pipeline evaluates the template before any AWS call
  (CFN Guard, CFN Hooks, Checkov, OPA, Terraform `validation`, CDK runtime validation).
  Requires `"api"` in `gateable_by[]`.
- `reactive-detective` — AWS Config or Access Analyzer flags existing state (Config rule
  Lambda, managed Config rule, Access Analyzer). Requires `"api"` in `gateable_by[]`.
- `reactive-corrective` — remediation after a detective finding (SSM Automation, Step
  Functions, Lambda remediator). Requires `"api"` in `gateable_by[]` AND
  `mutability != "create_only"`.

**Posture classification (three-pass derivation from `mitigation_goal`, theme nouns, and title/statement fallback):**

Mitigation goals vary in style across sources. Some are verb-led
("Enforce KMS encryption"); others are noun-phrase themes ("Encryption at
Rest — CMK", "Network Perimeter — Approved Networks"). Run all three passes
and take the union before falling back.

```
posture_set = []
haystack_goal = mitigation.mitigation_goal

# ── Pass 1 — Verb pass against mitigation_goal ──────────────────────────
if haystack_goal matches /prevent|block|disallow|deny|mandate/:                posture_set += [preventative-proactive, preventative-request]
if haystack_goal matches /enforce|require|ensure.*(?:at creation|configured|set)/:
                                                                                posture_set += [preventative-proactive, preventative-request]
if haystack_goal matches /encrypt|cmk|kms key|customer-managed key/:           posture_set += [preventative-proactive, preventative-request]
if haystack_goal matches /protect|safeguard|guard against/:                    posture_set += [preventative-proactive, preventative-request]
if haystack_goal matches /enable.*(?:logging|telemetry|monitoring)|configure.*(?:at creation|upfront)|ensure.*(?:available|enabled|active)/:
                                                                                posture_set += [preventative-proactive]
if haystack_goal matches /detect|monitor|audit|flag|observe|alert|visibility|anomaly|forensic/:
                                                                                posture_set += [reactive-detective]
if haystack_goal matches /remediat|rollback|restore|auto-repair|revert/:       posture_set += [reactive-corrective]
if haystack_goal matches /\bcorrect\b.*(?:state|configuration|drift|violation)/
   AND NOT                /correct (?:classification|tagging|labeling)/:       posture_set += [reactive-corrective]

# ── Pass 2 — Noun-phrase themes against mitigation_goal ─────────────────
# Noun-phrase goals like "Identity Perimeter" or "Encryption at Rest" have
# no verb to match; their posture is implied by the theme.
if haystack_goal matches /perimeter|boundary|allow.?list|deny.?list/:          posture_set += [preventative-proactive, preventative-request]
if haystack_goal matches /at rest|in transit|encryption/:                      posture_set += [preventative-proactive, preventative-request]
if haystack_goal matches /logging|telemetry|observability|audit trail/:        posture_set += [preventative-proactive, reactive-detective]
if haystack_goal matches /tagging|governance/:                                 posture_set += [preventative-proactive]
if haystack_goal matches /remediation|recovery|rollback/:                      posture_set += [reactive-corrective]

# ── Pass 3 — Title + statement fallback (only if passes 1 & 2 empty) ────
# Some mitigations compress the actionable signal into the title or the
# statement text rather than the goal field. Re-run BOTH pass 1 and pass 2
# regexes against (title + " " + statement) as a last resort.
if posture_set is empty AND (mitigation.title or mitigation.statement):
    haystack_fallback = (mitigation.title or "") + " " + (mitigation.statement or "")
    <re-run pass 1 AND pass 2 patterns against haystack_fallback>

# Critical mitigations get ALL FOUR postures where feasible (defense-in-depth)
if criticality == "critical":
    posture_set = [preventative-request, preventative-proactive, reactive-detective, reactive-corrective]

# Final fallback when all three passes return empty
if posture_set is empty:
    posture_set = [preventative-proactive]
    append to `classification_fallback_log` (emit in map-controls-generated.json):
        {"mitigation_id": M.id, "reason": "no keyword match in goal/title/statement"}
```

**Over-generation is safe.** The feasibility filter (next section) drops
postures that have no gateable parameter — so a noun-phrase match that
fires multiple postures does not pollute the output. A mitigation goal
like "Audit data at rest" legitimately warrants BOTH `reactive-detective`
(from `audit`) and `preventative-proactive|request` (from `at rest`); the
filter resolves which layer(s) are actually buildable.

**Persist the fallback log.** Every entry appended to
`classification_fallback_log[]` MUST be written into
`map-controls-generated.json` as a top-level key (not just printed to
stdout). Downstream consumers and validators rely on the JSON record to
verify that the fallback only fires on genuinely ambiguous goals.

**Feasibility filter per posture (per parameter path P in `mitigation.request_parameters`):**

Look up P in `validated.json.api_surface.operations[].parameters[]` and read
`gateable_by[]`, `sar_condition_key`, `enum`, `mutability`:

| Posture | Feasibility requirement | Mechanism family |
|---|---|---|
| `preventative-request` | `"sar"` in `gateable_by` (requires `sar_condition_key`) | SCP, RCP, IAM identity policy, trust policy, permission boundary, resource-based policy, KMS key policy, VPCE policy |
| `preventative-proactive` | `"api"` in `gateable_by` | CFN Guard, CFN Hook, Checkov, OPA, Terraform validation, CDK runtime validation |
| `reactive-detective` | `"api"` in `gateable_by` | AWS Config rule (managed or custom Lambda), Access Analyzer |
| `reactive-corrective` | `"api"` in `gateable_by` AND `mutability != "create_only"` | SSM Automation runbook, Step Functions workflow, Lambda remediator |

**Emit one control per feasible posture.** For each posture in `posture_set`:
- If feasibility holds, emit a control in `map-controls-generated.json.controls[]` with:
  - `posture`: one of the four values above
  - `mechanism`: selected from the mechanism family (canonical snake_case via the
    mechanism→scope table in §2.3)
  - `source`: derived from the parameter's `gateable_by` (`"sar"`, `"api"`, or `"both"`)
- If feasibility FAILS, append to `map-controls-generated.json.coverage_gaps[]`:
  ```json
  {"mitigation_id": "M-X.0", "posture": "reactive-corrective",
   "reason": "parameter is create_only — cannot remediate post-create"}
  ```

A single critical mitigation can produce up to 4 controls (one per posture). A
low-priority non-critical mitigation typically produces 1-2.

**Downstream contract:** The `posture` field is propagated through `map-assemble` into
`mapping-results.json.controls[].posture`, then baked into each generated control file's
`_metadata.posture`. Validator CHECK-15 enforces posture ↔ directory consistency at
write time — a `reactive-detective` control that lands in `preventive/scp-policy.json`
will fail the hook.

### 2.3 Control Matrix — Category x Scope

Assign each control a primary **category** (X-axis) and a **scope level** (Y-axis):

**Categories (X-axis):**

| Category | Code | Definition | Examples |
|----------|------|-----------|----------|
| Proactive | PRO | Prevents non-compliant resources from being created | CFN Guard, SCP deny, Config proactive rules, OPA |
| Preventive | PRV | Blocks unauthorized actions at runtime | IAM policies, resource policies, SCPs, VPC SGs, KMS key policies |
| Detective | DET | Identifies non-compliant or suspicious state after the fact | Config rules, CloudTrail analysis, CloudWatch alarms |
| Corrective | COR | Automatically remediates non-compliant state (Responsive controls) | SSM runbooks, Lambda remediation, EventBridge workflows |

**Scope Levels (Y-axis):**

| Scope | Code | Definition | Examples |
|-------|------|-----------|----------|
| Organisation | ORG | Applied across the AWS Organization | SCPs, tag policies, Config org rules |
| Account | ACC | Applied within a single AWS account | IAM policies, permission boundaries, Config rules |
| Resource | RES | Applied directly to an individual resource | Resource-based policies, KMS key policies |

**Deterministic mechanism → scope mapping (REQUIRED for stability across runs):**

To prevent iteration-to-iteration drift, every control's `scope` MUST be derived from
its `mechanism` using this table. Do NOT choose scope by thematic heading (e.g., "Resource
× Proactive" in generate-preventive) — the mechanism alone determines scope.

| Mechanism | Scope | Rationale |
|-----------|-------|-----------|
| SCP (Service Control Policy) | ORG | Attached at the Organization / OU level |
| RCP (Resource Control Policy) | ORG | Organization policy type |
| Tag policy | ORG | Organizations-native |
| Config org rule / conformance pack (org) | ORG | Deployed via Organizations |
| CloudFormation Guard rule | ACC | Enforced at account's CFN deploy (or per-account Hook) |
| CloudFormation Hook | ACC | Registered per-account |
| OPA / Rego policy | ACC | Evaluated per-account at CI / deploy |
| Checkov custom policy | ACC | Evaluated per-account at CI / deploy |
| IAM identity-based policy (user/role) | ACC | Principals live at the account level |
| IAM permission boundary | ACC | Attached to an account-level principal |
| AWS Config rule (account) | ACC | Deployed per-account |
| EventBridge rule (default bus) | ACC | Default event bus is account-scoped |
| CloudWatch alarm / metric filter | ACC | Per-account resources |
| SSM runbook / automation document | ACC | Document is account-scoped |
| Lambda remediator | ACC | Function lives in an account |
| Step Functions workflow | ACC | State machine lives in an account |
| Resource-based policy (S3 bucket policy, SNS topic policy, Lambda resource policy, SQS queue policy) | RES | Attached to a specific resource ARN |
| KMS key policy | RES | Attached to a specific key |
| VPC endpoint policy | RES | Attached to a specific endpoint |

If a new mechanism is proposed that is not in this table, map-generate-controls MUST add a
row explicitly — never infer scope ad-hoc. This makes control ID prefixes stable across
runs, which is required for downstream generate skills to produce consistent artifact IDs.

Each control MUST have exactly one category AND one scope level.

### 2.4 Control output schema

Every control MUST include these fields:

```json
{
  "id": "CTRL-ORG-PRV-001",
  "name": "Enforce CMK encryption on <Resource> creation via SCP",
  "description": "SCP denies <prefix>:Create<Resource> unless encryption condition key is present",
  "posture": "preventative-request",
  "source": "sar",
  "scope": "ORG",
  "category": "PRV",
  "mechanism": "SCP",
  "mitigation_ids": ["M-<Resource>.0", "M-<Resource>.3"],
  "parameters_controlled": ["$.encryptionKeyArn"],
  "condition_keys": ["<prefix>:encryptionKeyArn"],
  "actions": ["<prefix>:Create<Resource>", "<prefix>:Update<Resource>"],
  "resource_types": ["AWS::<Service>::<Resource>"],
  "assessment_gap_ids": [],
  "security_rationale": "The mitigation requires encryption key enforcement at creation time. An SCP is the strongest mechanism because it operates at the organization level, denying any Create call that lacks the encryption key parameter regardless of the caller's IAM permissions. This ensures no resource can be created without customer-managed encryption.",
  "attack_techniques": ["T1530", "T1486"],
  "framework_keywords": ["encryption", "key management", "data protection", "policy enforcement"]
}
```

**Field requirements:**
- `id`: Format MUST match the regex `^CTRL-(ORG|ACC|RES)-(PRO|PRV|DET|COR)-\d{3}$`
  — literal `CTRL-` prefix, scope token, category token, three-digit sequence.
  Example: `CTRL-ORG-PRV-001`, `CTRL-ACC-DET-012`, `CTRL-RES-PRO-003`.
  **Do NOT** use service-prefixed variants (`S3-RES-PRO-01`, `ATH-ORG-PRV-01`,
  `LAMBDA-ACC-DET-03`). The service identity lives in `_metadata.service` and
  `validated.service` — duplicating it inside the control ID creates drift that
  fails `validate_state.py` CHECK-S11 and `validate_controls.py` CHECK-13 body
  scans. Service-agnostic uniformity lets every downstream check be a literal
  string match rather than "strip prefix, then compare". Validator CHECK-S11
  enforces this regex enum; non-conforming IDs fail state validation.
- `posture`: One of `preventative-request`, `preventative-proactive`, `reactive-detective`,
  `reactive-corrective`. Derived from the classification in §2.2.1. Propagated downstream
  to `mapping-results.json.controls[].posture` by map-assemble, then to each generated
  artifact's `_metadata.posture` so CHECK-15 can enforce posture ↔ directory consistency.
- `source`: One of `sar`, `api`, `both` — derived from the parameter's `gateable_by[]`.
  Indicates which data source authoritatively drives the mechanism's contents.
- `scope`: Abbreviated code: `ORG`, `ACC`, `RES`
- `category`: Abbreviated code: `PRV`, `PRO`, `DET`, `COR`
- `mechanism`: AWS enforcement mechanism (SCP, CloudFormation Hook, AWS Config Rule, VPC Endpoint Policy, IAM Permission Boundary, Resource Policy, IAM Trust Policy, IaC Template, CloudTrail, CloudWatch Alarm, CloudWatch Logs, Kinesis Data Streams, SSM Automation, Lambda Remediation, EventBridge + Step Functions, Tag Policy, OPA Policy, CloudFormation Guard, Compensating Control Documentation)
- `mitigation_ids`: Non-empty array — every control MUST trace to at least one mitigation
- `parameters_controlled`: API parameters this control enforces (from mitigation `request_parameters[]`)
- `condition_keys`: IAM condition keys used (empty array for non-IAM controls)
- `actions`: IAM actions restricted/monitored (empty array for non-IAM controls)
- `resource_types`: AWS resource types affected (CFN format)
- `assessment_gap_ids`: Assessment gaps addressed (empty array if none)
- `security_rationale`: 2-3 sentences explaining the mitigation-to-mechanism reasoning chain. MUST include:
  (1) what the mitigation requires, (2) why this specific mechanism was chosen, (3) what it prevents/detects.
  This field is the PRIMARY context for downstream framework-mapping — write it as if the reader has
  never seen the mitigation text.
- `attack_techniques`: ATT&CK technique IDs this control mitigates (empty array if `attack_surface`
  not present in validated.json). Populated by cross-referencing the control's `actions[]`,
  `condition_keys[]`, and `mechanism` against `attack_surface.applicable_techniques[].api_surface_evidence[]`.
  A control mitigates a technique if it restricts/monitors any action listed in that technique's evidence.
- `framework_keywords`: 4-8 keywords for framework objective matching. Include BOTH domain keywords
  (encryption, access, network) AND mechanism keywords (deny, monitor, audit, enforce, restrict).

### 2.5 Responsive control generation

For every detective control, evaluate whether a responsive control is appropriate. Generate
responsive controls for at minimum:
- **Encryption drift**: auto-remediate resources created without CMK encryption
- **Authentication drift**: alert + optional auto-remediate gateways with AuthorizerType=NONE
- **Tag compliance**: auto-tag resources missing mandatory tags
- **VPC configuration drift**: alert on resources created without VPC networking

Link each responsive control to the same mitigation IDs as its corresponding detective control.
Use mechanism types: `SSM Automation`, `Lambda Remediation`, `EventBridge + Step Functions`.

### 2.6 Assessment gap coverage

For every `REQUIREMENT GAP` and `CUSTOMER ACTION REQUIRED` from `assessment_gaps[]`:
- Generate at least one control that addresses the gap
- Link via `assessment_gap_ids[]` on the control

### 2.7 ATT&CK technique cross-reference (optional)

If `validated.json` contains `attack_surface.applicable_techniques[]`:
1. For each control, check if any of its `actions[]` appear in a technique's `api_surface_evidence[]`
2. If so, add that technique's ID to `attack_techniques[]` on the control
3. Also check mechanism alignment:
   - SCP/IAM controls → relevant to T1078, T1098, T1548 (identity techniques)
   - Encryption controls → relevant to T1530, T1486 (data techniques)
   - Network controls → relevant to T1190, T1133 (access techniques)
   - Logging controls → relevant to T1562, T1070 (evasion techniques)
4. If `attack_surface` is NOT present in validated.json, set `attack_techniques: []` on all controls

### 2.8 Compensating control documentation

Some capabilities are NOT available for the service (e.g., RCP not supported, no delegated admin,
ABAC partial). For each unavailable capability referenced in assessment_gaps or where controls
cannot be implemented:
- Generate a control with `mechanism: "Compensating Control Documentation"`
- Describe what compensating measures should be taken
- Include in the controls array like any other control

---

## Phase 3: Mitigation Coverage Completeness Check (MANDATORY)

**CRITICAL — Do NOT write output until this check passes.**

After generating all controls, verify that EVERY mitigation in `existing_mitigations[]` has at
least one control referencing its ID in `mitigation_ids[]`:

```python
all_mit_ids = set(m['id'] for m in existing_mitigations)
covered_mit_ids = set()
for ctrl in controls:
    covered_mit_ids.update(ctrl.get('mitigation_ids', []))
uncovered = all_mit_ids - covered_mit_ids
if uncovered:
    print(f"UNCOVERED MITIGATIONS: {sorted(uncovered)}")
    # MUST generate controls for each — see guidance below
```

**For each uncovered mitigation, generate controls using this guidance:**

- **Availability mitigations** (multi-AZ, redundancy): CloudFormation Guard rule + Config rule
  checking subnet AZ diversity. Distinct from "has VPC subnets."
- **Authentication configuration mitigations** (JWT, OIDC): Guard rule validating full auth config
  (discovery URL, audiences, clients, scopes). Distinct from "authorizer type != NONE."
- **Network perimeter mitigations** (approved networks): VPC endpoint policies + IAM conditions
  restricting by source VPC/endpoint.
- **Data lifecycle mitigations** (retention, deletion): Config rules checking resource config.
- **Any other**: Read `mitigation_goal` and `request_parameters[]` to determine domain, then generate.

**Re-run the check after generating gap-filling controls. Zero uncovered mitigations required.**

---

## Phase 4: Write Output

Write `.service-approval/<slug>/04-map/map-controls-generated.json`:

```json
{
  "schema_version": "1.0",
  "service": "<service-name>",
  "controls": [
    {
      "id": "CTRL-ORG-PRV-001",
      "name": "...",
      "description": "...",
      "posture": "preventative-request",
      "source": "sar",
      "scope": "ORG",
      "category": "PRV",
      "mechanism": "SCP",
      "mitigation_ids": ["M-<Resource>.0"],
      "parameters_controlled": ["$.encryptionKeyArn"],
      "condition_keys": ["<prefix>:encryptionKeyArn"],
      "actions": ["<prefix>:Create<Resource>"],
      "resource_types": ["AWS::<Service>::<Resource>"],
      "assessment_gap_ids": [],
      "security_rationale": "...",
      "framework_keywords": ["encryption", "key management"]
    }
  ],
  "control_summary": {
    "total_controls": 60,
    "by_scope": { "ORG": 14, "ACC": 27, "RES": 19 },
    "by_category": { "PRV": 20, "PRO": 10, "DET": 18, "COR": 12 },
    "by_mechanism": { "SCP": 10, "AWS Config Rule": 12 }
  },
  "mitigation_coverage": {
    "total_mitigations": 37,
    "covered": 37,
    "uncovered": 0,
    "uncovered_ids": []
  },
  "assessment_gap_coverage": {
    "total_gaps": 13,
    "covered": 10,
    "uncovered": 3,
    "uncovered_ids": ["GAP-3", "GAP-7", "GAP-11"]
  },
  "coverage_gaps": [
    {
      "mitigation_id": "M-<Resource>.2",
      "posture": "reactive-corrective",
      "reason": "Parameter $.encryptionKey is create_only — cannot remediate post-create"
    }
  ]
}
```

The `coverage_gaps[]` array is produced by Rule C1's feasibility filter — one entry per
(mitigation, posture) pair where no feasible mechanism exists. `map-assemble` forwards
these into `mapping-results.json.coverage_gaps[]`.

---

## Validate Output

Output validation runs automatically via PostToolUse hook. The JSON Schema (see Schema above) hard-fails on shape / id-pattern / scope-category enum / required-field drift. `validate_state.py::check_controls_generated` adds the cross-file and cross-field checks the schema cannot express: duplicate control IDs, scope/category mismatch between id and fields, mitigation coverage against `validated.json`, and `control_summary.total_controls` vs actual length.

## Print Summary

```
Map (Generate Controls) complete:
  Controls: {total} ({by_scope}, {by_category})
  Mitigations covered: {covered}/{total} (100%)
  Assessment gaps covered: {covered}/{total}
  Output: .service-approval/<slug>/04-map/map-controls-generated.json
```
