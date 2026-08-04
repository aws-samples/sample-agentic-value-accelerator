---
name: generate-preventive
description: Generate preventive and proactive security control artifacts — SCPs, resource policies, KMS key policies, permission boundaries, tag policies, OPA policies, and CloudFormation Guard rules. Reads from mapping-results.json and validated.json.
disable-model-invocation: false
argument-hint: '[--service=<name>] [--include-unverified]'
---

# Service Approval — Generator: Preventive & Proactive Controls

Generate all preventive and proactive security control artifacts from the Controls Matrix.
This covers Organisation×Proactive, Organisation×Preventive, Account×Proactive,
Account×Preventive, Resource×Proactive, and Resource×Preventive cells.

**Output:** `.service-approval/<slug>/05-generate/preventive/` and `.service-approval/<slug>/05-generate/proactive/`

This is one of 3 focused generate sub-skills. Each writes to separate directories.

---

## Prerequisites

```bash
test -f .service-approval/<slug>/04-map/mapping-results.json && echo "mapping-results: OK" || echo "ERROR"
test -f .service-approval/<slug>/03-validate/validated.json && echo "validated: OK" || echo "ERROR"
mkdir -p .service-approval/<slug>/05-generate/{preventive,proactive/opa-policies}
```

Load controls from `mapping-results.json` and API surface from `validated.json`:
```bash
python3 -c "
import json
mr = json.load(open('.service-approval/<slug>/04-map/mapping-results.json'))
vj = json.load(open('.service-approval/<slug>/03-validate/validated.json'))
prv = [c for c in mr['controls'] if c['category'] == 'PRV']
pro = [c for c in mr['controls'] if c['category'] == 'PRO']
print(f'Preventive controls: {len(prv)}')
print(f'Proactive controls: {len(pro)}')
print(f'API operations: {len(vj[\"api_surface\"][\"operations\"])}')
"
```

Unless `--include-unverified` is set, skip controls where `verified: false`.

## Artifact Header Template

Every generated artifact MUST include these comment lines at the top:
```
# SCOPE: <org|account|resource>
# LAYER: <proactive|preventive>
# POSTURE: <preventative-request|preventative-proactive>
# CONTROLS: <comma-separated control IDs>
# FRAMEWORK: <framework-name> — <FULL sorted union of ALL MAPPED objective IDs>
# MITIGATIONS: <comma-separated mitigation IDs>
# GENERATED: service-approval v3.0.0
# SERVICE: <service-name>
```
For JSON files, add as a `"_metadata"` key AND set `_metadata.posture` to the exact
posture value from `mapping-results.json.controls[].posture` for the control this
artifact implements. For HCL/TypeScript, use comment blocks.

**CHECK-15 enforcement:** Every generated artifact's `_metadata.posture` MUST match its
directory family:
- `preventative-request` → `preventive/{scp,rcp,iam-policies,permission-boundary,resource-policy,vpce-policy,kms-key-policy}*.json`
- `preventative-proactive` → `proactive/**` or `iac/**`

An SCP tagged with `posture: "reactive-detective"` would fail the hook — the upstream
`map-generate-controls` Rule C1 filter should never have produced it. If the hook
fires, trace back to the control's posture in `mapping-results.json` and fix the root
cause (either the posture classification or the mechanism selection).

The `FRAMEWORK` line MUST be copied VERBATIM from
`mapping-results.json.framework_header_canonical` — `scripts/map-assemble.py` precomputes
this sorted-union string once so every artifact emits the identical header. Do NOT re-derive
the list from `_metadata.controls[]` or from per-control `framework_objectives[]` — that
produces per-artifact subsets and fails CHECK-X1 (`validate_cross.py:120`), which asserts
every artifact shares one framework header. Read `framework_header_canonical`, paste it
after `# FRAMEWORK: ` (and into `_metadata.framework` for JSON files), done.

---

## Rule C2 — SAR-driven mechanism contents (REQUIRED)

All mechanisms in this skill that operate at **AWS IAM request-time evaluation** are
SAR-driven. That includes: SCPs, RCPs, IAM identity-based policies, IAM trust policies,
permission boundaries, resource-based policies, VPCE policies, KMS key policies.

For every such artifact:

1. **Every Condition-block key MUST come from `validated.json.capabilities.iam.condition_keys[]`**,
   the AWS global key set (e.g., `aws:PrincipalARN`, `aws:SourceAccount`, `aws:RequestTag/*`),
   or — for KMS key policy files only — the KMS service-owned key set
   (`kms:ViaService`, `kms:EncryptionContext:*`, `kms:GrantOperations`, etc.).
2. **API parameter paths are NEVER valid condition keys.** A literal like
   `"$.networkConfiguration.awsvpcConfiguration.assignPublicIp"` in a Condition block
   is silently ignored by AWS IAM — the intended guardrail does not fire. Instead, find
   the SAR condition key that gates the parameter (look up the parameter in
   `validated.json.api_surface.operations[].parameters[]` and read its `sar_condition_key`
   field, populated by Phase B enrichment).
3. **Every Action in the statement MUST come from `validated.json.api_surface.operations[].operation`**
   OR `capabilities.iam.permission_only_actions[]` (this was already required; restated
   here for completeness — SAR-driven mechanisms are grounded in both the action list
   AND the condition-key list).

4. **Action-name verification (HARD RULE).** Every IAM `Action` string in every policy
   artifact (SCP, resource policy, IAM policy, permission boundary, KMS key policy,
   VPCE policy) MUST appear verbatim (case-sensitive) in one of:
   - `sar-facts.json` action list or `permission_only_actions[]`
   - `research-api-surface.json.api_surface.operations[].operation`
   - `validated.json.api_surface.operations[].operation` (post-verification authoritative)

   Do NOT generate action names by analogy or extrapolation. If a mitigation statement
   references an action in English prose (e.g., "prevent memory searches"), look up the
   actual SAR action that implements the concept — do not translate the English verb
   into an action suffix. If the service does not implement an action the control
   requires, document it as a compensating control in
   `compensating-controls-documentation.json` rather than inventing an action name.

   Example of the failure mode (real regression observed in production runs):
   - WRONG: `<service-prefix>:SearchRecords` — invented by the LLM; does not
     exist in SAR or botocore. IAM AccessAnalyzer rejects with "The action X does
     not exist."
   - RIGHT: `<service-prefix>:RetrieveRecords` — the actual SAR action.

   IAM AccessAnalyzer at Tier 2 validates every action against the live service-prefix
   registry. Fabricated actions pass JSON-syntax checks but fail deploy-time policy
   validation.

Validator CHECK-14a enforces rule 1 at hook time. A condition-block key that is not a
SAR/global/KMS key fails the hook with a remediation message. The #1 failure mode this
prevents is an agent treating an API parameter as if it were a condition key — a class
of silent-ignore bug that was endemic before Phase B enrichment.

### Zero-service-condition-keys branch

Some services (examples: DataSync, Athena, Step Functions in some configurations)
publish NO service-specific condition keys — only the global tag keys
(`aws:RequestTag/${TagKey}`, `aws:ResourceTag/${TagKey}`, `aws:TagKeys`,
`aws:PrincipalTag/${TagKey}`) apply. You can tell deterministically by inspecting
`validated.json.capabilities.iam.condition_keys[]`: if every entry's `key` starts
with `aws:`, the service has zero service-specific keys.

In that branch, SCPs and permission boundaries can ONLY gate tag-based controls
(creation-time tagging, tag-mandated resource categories) — they CANNOT gate
service-specific properties like encryption mode, network mode, result location,
workgroup enforcement flags, etc. Do NOT fabricate a service-specific condition
key to make an SCP statement work. CHECK-14a rejects invented keys, and even if
it didn't, AWS IAM would silently ignore the condition and the guardrail would
be a no-op.

Instead, route non-tag gating to mechanisms that can see the property values
directly:

- **Preventative-proactive** → CloudFormation Guard rules (`proactive/cfn-guard-rules.guard`)
  and Checkov custom policies (`proactive/custom-policies/`). These evaluate
  template bodies before deploy and have full visibility into every property.
- **Reactive-detective** → AWS Config Rules with Lambda handlers
  (`detective/config-rule-lambdas/**/handler.py`). These evaluate deployed
  resources via the Config configuration item.
- **Reactive-corrective** → SSM Automation runbooks (`responsive/ssm-runbook.yaml`)
  or Step Functions workflows (`responsive/stepfunctions-workflow.json`) invoked
  by EventBridge on the relevant AWS API events.

The `map-generate-controls` Rule C1 feasibility filter already routes around
SCP/IAM infeasibility at control-selection time — this rule ensures the
generate-preventive skill doesn't produce SCP artifacts whose statements would
be silently ignored at runtime.

---

## Organisation × Proactive

### Tag Policy (`preventive/tag-policy.json`)
- Enforce: Owner, Environment, Purpose, CostCenter + service-specific tags from controls
- Use `awsknowledge` MCP to confirm valid tag key formats

### OPA Org Policy (`proactive/opa-policies/org-policy.rego`)
- OPA `.rego` rules for org-wide provisioning rules not expressible as tag policies

### SCP Provisioning Deny (`preventive/scp-provisioning.json`)
- Only for controls where `scp_expressible: true` with provisioning-time intent
- Follow SCP authoring rules from Organisation × Preventive below

---

## Organisation × Preventive

### SCP Runtime Deny (`preventive/scp-policy.json`)

Only generate if `validated.json` `capabilities.organization_policies.scp_expressible: true`.
If false, write `_metadata.scp_gap` note and skip.

**SCP authoring rules (strict):**
- Always `"Effect": "Deny"` — never Allow-only
- Always include relevant condition key(s) — never bare action deny without conditions
- Use real condition keys from `awsknowledge` MCP — confirm each key is valid for the action
- **No custom placeholders in policy documents**: SCPs are IAM policies. Custom placeholders
  like `${trusted:account-id}` or `${ORGANIZATION_ID}` cause `MalformedPolicyDocument` errors.
  IAM policy variables like `${aws:PrincipalAccount}` work in real SCPs evaluated by Organizations
  but fail when the policy is tested as a standalone IAM managed policy (which a downstream policy tester typically does).
  Use literal placeholder values like `123456789012` with a `_metadata._deployment_notes` field
  explaining what values to substitute at deployment time.

- **ARN region and account placeholders (HARD RULE)**: In ARN region and account
  segments, NEVER use shell-style placeholders like `${AWS_REGION}`, `${AWS_ACCOUNT_ID}`,
  `${ACCOUNT_ID}`, `${REGION}`. IAM AccessAnalyzer treats them as literal values and
  rejects the policy at deploy time with "The Region X is not valid for this resource"
  or "The account X is not valid." Valid forms:
  - **Any region / any account**: use `*` wildcard.
  - **Scoped via IAM policy variables**: `${aws:RequestedRegion}` (region),
    `${aws:PrincipalAccount}` / `${aws:ResourceAccount}` (account).
  - **Literal substitution**: `us-east-1` and `123456789012` with
    `_metadata._deployment_notes` explaining the substitution.

  Examples:

  ```text
  WRONG:
    "Resource": "arn:aws:<service>:${AWS_REGION}:${AWS_ACCOUNT_ID}:<type>/*"

  RIGHT (any region, any account):
    "Resource": "arn:aws:<service>:*:*:<type>/*"

  RIGHT (scoped via IAM policy variables):
    "Resource": "arn:aws:<service>:${aws:RequestedRegion}:${aws:PrincipalAccount}:<type>/*"

  RIGHT (literal substitution with deployment note):
    "Resource": "arn:aws:<service>:us-east-1:123456789012:<type>/*"
    "_metadata": {"_deployment_notes": "Replace us-east-1 and 123456789012 with your account's region and ID."}
  ```

  The shell-style `${AWS_REGION}` pattern is a harness-substitution convention only —
  it belongs in `_deployment_notes` prose (instructional text), never in Resource ARN
  values, Condition key values, or any string IAM parses as policy content.
- **MANDATORY — Include ALL applicable actions per condition key**: When a condition key
  applies to multiple actions (e.g., both `Create*` and `Update*`), the SCP statement MUST
  include ALL actions from the condition key's `applies_to_actions[]` in validated.json.
  Only covering Create* leaves Update* unprotected — an attacker could modify existing
  resources to remove security controls. Read `capabilities.iam.condition_keys[].applies_to_actions`
  for every condition key used and include the full action set.
- **Tag enforcement MUST cover UntagResource**: SCPs that enforce mandatory tags on Create*
  operations MUST also deny `UntagResource` for those tag keys using `aws:TagKeys` condition.
  Without this, mandatory tags can be removed after resource creation. Add a separate Deny
  statement: `"Action": "<prefix>:UntagResource"` with
  `"Condition": {"ForAnyValue:StringEquals": {"aws:TagKeys": ["Owner", "CostCenter", "Environment", "DataClassification"]}}`.
- Use `"NotAction"` only for region-restriction controls
- Use `"Principal": "*"` only in resource-based policies, NOT in SCPs
- Track the **minified policy body size** (Version + Statement, excluding
  `_metadata`); split across multiple files at 5120 bytes. AWS Organizations'
  SCP limit applies to the minified JSON submitted to the API, not the
  pretty-printed file. Compute before writing:
  `len(json.dumps({k:v for k,v in policy.items() if k!='_metadata'}, separators=(',',':')))`
- **MANDATORY BreakGlass exclusion**: `"ArnNotLike": {"aws:PrincipalARN": ["arn:*:iam::*:role/BreakGlassRole"]}`
  in EVERY Deny statement. Only exception: `DenyProhibitedTagKeys` (PII patterns).
- **AND-logic awareness**: Conditions in one block use AND. If exceptions should be
  independent (OR), use SEPARATE statements.
- **Service-principal vs confused-deputy keys MUST live in separate statements**:
  `aws:PrincipalServiceName` is set ONLY when an AWS service is the calling principal;
  `aws:SourceAccount` / `aws:SourceArn` are cross-service confused-deputy keys set on
  the target call FROM the service. They never co-occur in the same authorization
  context, so AND-ing them in one Condition block makes the Deny unreachable. Split
  into two statements: one keyed on `aws:PrincipalServiceName` for service-as-caller
  paths, one keyed on `aws:SourceAccount`/`aws:SourceArn` for confused-deputy paths.

  ```json
  // WRONG — conditions AND together; deny never fires because the two keys
  // are never present in the same authorization context.
  {
    "Effect": "Deny",
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals":    {"aws:PrincipalServiceName": "<service>.amazonaws.com"},
      "StringNotEquals": {"aws:SourceAccount": "${aws:PrincipalAccount}"}
    }
  }

  // RIGHT — two statements, each keyed on exactly one mechanism. The first
  // covers the service-as-caller path; the second covers the confused-deputy
  // path. Either path alone fires the Deny.
  {
    "Sid": "DenyServicePrincipalUnscoped",
    "Effect": "Deny",
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {"aws:PrincipalServiceName": "<service>.amazonaws.com"}
    }
  },
  {
    "Sid": "DenyConfusedDeputyAcrossAccount",
    "Effect": "Deny",
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringNotEquals": {"aws:SourceAccount": "${aws:PrincipalAccount}"}
    }
  }
  ```

**No non-standard fields in Statements**: IAM policy Statements only accept standard
keys (`Sid`, `Effect`, `Principal`, `NotPrincipal`, `Action`, `NotAction`, `Resource`,
`NotResource`, `Condition`). Do NOT add `_description`, `_comment`, `_control_ids`, or
any other underscore-prefixed metadata inside Statement objects — IAM Access Analyzer
and the SCP API will reject them. Put per-statement documentation in the `Sid` field
(e.g., `"Sid": "DenyUnencryptedCreation"`) or as `_metadata` at the top level only.

Format:
```json
{ "_metadata": { ... }, "Version": "2012-10-17", "Statement": [ ... ] }
```

SCP validation (JSON syntax and 5120-byte minified policy body limit, excluding
`_metadata`) runs automatically via PostToolUse hook (validate_controls.py
Checks 7, 12).

**SCP simulation metadata (REQUIRED for every SCP):** Each SCP JSON MUST include a
`_simulation_tests` field in the `_metadata` object. This tells a downstream test
harness what actions to simulate as denied and what actions should remain allowed.

```json
{
  "_metadata": {
    "framework": "...",
    "controls": ["CTRL-..."],
    "_simulation_tests": {
      "should_deny": [
        {"action": "lambda:CreateFunction", "context": {"lambda:CodeSigningConfigArn": ""}}
      ],
      "should_allow": [
        {"action": "lambda:CreateFunction", "context": {"lambda:CodeSigningConfigArn": "arn:aws:lambda:us-east-1:123456789012:code-signing-config:csc-abc"}}
      ]
    }
  },
  "Version": "2012-10-17",
  "Statement": [...]
}
```

The `should_deny` list includes actions + context values that the SCP should block.
The `should_allow` list includes actions + context values that should pass.
A test harness exercising SCPs typically creates an ephemeral test role, attaches
the SCP as an IAM policy, and calls `iam:SimulatePrincipalPolicy` to verify the
deny/allow behavior matches the test vectors in `_simulation_tests`.

### AI Opt-out Policy (`preventive/ai-optout-policy.json`)
Only if `ai_optout_applicable: true`.

---

## Account × Proactive

### Rule C3 — API-driven mechanism contents (REQUIRED for every artifact below)

CFN Guard rules, CFN Hooks, Checkov policies, OPA/Rego rules, Terraform variable
`validation` blocks, and CDK runtime validation are **API-driven** mechanisms — they
evaluate IaC/template contents before any AWS API call. Their contents MUST be grounded
in `validated.json.api_surface.operations[].parameters[]`:

1. **Every property path referenced by a rule MUST correspond to a parameter in
   `api_surface.operations[].parameters[]`.** Do not invent property paths; copy the
   `path` field verbatim (strip the `$.` prefix if the target DSL uses dotted notation).

   **CFN Guard caveat — API path ≠ CFN property path.** When the rule targets a
   CloudFormation resource, the API `path` from `parameters[]` is NOT authoritative for
   the rule. The CFN template schema is a separate surface: AWS can (and does) expose
   the same setting at a different resource type and under a different property name
   than the underlying API operation. Example: Fargate ephemeral-storage KMS appears in
   the RunTask API, but the CFN schema places it at
   `AWS::ECS::Cluster.Properties.Configuration.ManagedStorageConfiguration.FargateEphemeralStorageKmsKeyId`
   — `AWS::ECS::TaskDefinition.EphemeralStorage` only accepts `SizeInGiB`. Before
   asserting `<Path>.<Prop> exists` in a Guard rule, verify the property is actually
   declared on that resource type in the CFN Template Reference
   (https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/AWS_{cfn_prefix}.html)
   or via `awsiac` MCP. An assertion on a non-existent property is doubly broken: the
   rule can never pass a real template, AND a "compliant" template written to satisfy
   the rule fails cfn-lint E3002 (additional properties not allowed).
2. **Every enum-literal list (`in [...]`, `AllowedValues: [...]`, `validation {...}`,
   `contains([...], var.x)`) MUST use exact values from `parameters[].enum`.** Do NOT
   re-scrape AWS API reference docs at generate time — the enum values in
   `validated.json` are the single source of truth. Copy them verbatim. Common failure:
   substituting `IAM` for `IAM_AUTH`, `CustomJWT` for `CUSTOM_JWT_AUTHORIZER`, or
   inventing camelCase/PascalCase variants — all cause the rule to silently not fire.
3. **Every min/max/pattern constraint (TF `validation`, CFN `MinValue`/`MaxValue`/
   `AllowedPattern`) MUST come from `parameters[].min` / `parameters[].max` /
   `parameters[].pattern`.**

Validator CHECK-14b enforces rule 2 at hook time by scanning the artifact body for
enum-style literal lists and verifying every uppercase-literal value exists in
`parameters[].enum`. A literal value that is not in any parameter's enum fails the
hook. The check is scoped to API-driven files only — `preventive/` SCP-style files are
not evaluated by CHECK-14b (they are evaluated by CHECK-14a).

---

### CloudFormation Guard Rules (`proactive/cfn-guard-rules.guard`)

**Cross-validation constraint**: Every Guard rule MUST pass when evaluated against the
compliant CloudFormation template generated by generate-iac. The consistency check is:
```
cfn-guard validate --rules proactive/CTRL-*.guard --data iac/cloudformation/*.cfn.yaml
```
If a guard rule flags a violation in the compliant template, either the guard rule
uses an incorrect property path or the CFN template is missing a required property.
Both must be fixed together — trace to the source of the discrepancy.

- Use `awsiac` MCP for valid cfn-guard syntax per resource type
- **Every rule MUST have a control ID**: rule name includes control ID.
  Example: `rule enforce_encryption_ctrl_acc_pro_001 { ... }` (format example — NOT a literal ID).
  Do NOT generate "bonus" rules that are not mapped to any CTRL-* control. If a check is
  needed but has no control, either assign it to an existing control or omit it. Unmapped
  rules create audit confusion — every rule must trace back to the controls catalog.
- **Mapping-driven ID lookup (REQUIRED — do not invent IDs)**: Before writing ANY artifact,
  load `.service-approval/<slug>/04-map/mapping-results.json` and find the control whose `mechanism`
  matches the artifact type you are generating. Use the EXACT `id` field from that control,
  verbatim:
  - Rule/policy names (Guard, OPA, Checkov): lowercase the ID, convert hyphens to underscores
    (e.g., `CTRL-ACC-PRO-001` → `ctrl_acc_pro_001`)
  - JSON/YAML `_metadata.controls`, CFN headers, comments: uppercase form verbatim (`CTRL-ACC-PRO-001`)
  - The ID prefix (`ACC`/`ORG`/`RES`) is determined by mapping's mechanism→scope table — do
    NOT override based on a section heading in this skill.
  - If no control in mapping-results.json has a matching mechanism, do NOT generate the artifact.
    Pattern-matching an ID from a previous service's run is a bug.
- **One artifact per mechanism per control**: Each mapped control represents a distinct
  enforcement mechanism. If mapping has N controls whose `mechanism` field differs
  (e.g., one KMS Key Policy, one IAM Trust Policy, one VPC Endpoint Policy, one S3 Bucket
  Policy), generate N separate artifacts — do NOT collapse them into a single file just
  because they share a category/scope prefix. Collapsing loses the control-to-file
  traceability the control-to-file validator enforces (see `validate_controls.py` CHECK-13).
- **Valid Guard 2.x syntax only**: Do NOT use `%size()` function — it is not standard CFN Guard
  2.x syntax. For collection size checks, use `some` clauses, `[N] EXISTS` checks, or iterate
  with `when` blocks. Example: check subnet count ≥ 2 with `Properties.Subnets[1] EXISTS`.
- **Unique `let` variable names per resource type**: Each `let foo = Resources.*[ Type == ... ]`
  block MUST use a UNIQUE variable name across the whole .guard file. cfn-guard
  does NOT overwrite a previously declared `let` — redeclaring the same name
  parses but produces unpredictable rule dispatch across resource types. For a
  service with N CFN resource types, emit N uniquely-named variables:

  ```
  let {service}_{type_slug_1}_resources = Resources.*[ Type == 'AWS::{Service}::{Type1}' ]
  let {service}_{type_slug_2}_resources = Resources.*[ Type == 'AWS::{Service}::{Type2}' ]
  ...
  let {service}_{type_slug_N}_resources = Resources.*[ Type == 'AWS::{Service}::{TypeN}' ]
  ```

  Placeholders:
  - `{service}` — `sar-facts.json.cfn_prefix`, lowercased. Never hardcode.
  - `{Service}` — the CFN namespace (PascalCase, e.g. `Lambda`, `S3`, `BedrockAgentCore`).
  - `{TypeN}` — each CFN resource-type suffix the target service exposes,
    as listed in its CFN Template Reference page. Enumerate ALL exposed
    types; do not curate.
  - `{type_slug_N}` — the CFN type suffix, lowercased with non-alphanum
    replaced by `_`.

  The count and names of resource types come entirely from the target
  service's CFN model — this SKILL must never assume a fixed set. For a
  service with 1 CFN type, emit 1 variable; for 10, emit 10.
- **Rule bodies MUST contain at least one enforceable clause** — not just
  a placeholder comment like `# Check parameters: ...`. cfn-guard rejects
  comment-only rule bodies inside a `when ... { <resource_ref> { ... } }` block
  with a parse error (`Parser Error ... fragment %<var> !empty { ... }`). If a
  control's security intent cannot be expressed as a concrete property-level
  check (common for tag-array membership and complex conditional logic), DO
  NOT emit an empty-body Guard rule. Route the control to OPA/Rego (which can
  express richer set-membership logic) or to CFN Hooks (which run arbitrary
  lambda code) instead. Leaving a placeholder comment produces a broken .guard
  file that fails `cfn-guard parse-tree` at smoke-test time.
- **Block-level resource filtering — use `Resources.*[ Type == "X" ]`, NEVER `Resources[this] when this.Type`**:
  To iterate all Resources of a given type, use the block-level filter
  `Resources.*[ Type == "AWS::X::Y" ] { ... }`. The token `[this]` paired with
  `when this.Type == "..."` is NOT a valid selector in cfn-guard 3.x — it hard-errors
  with `Parser Error ... fragment [this] when this.Type` (exit 5). If the rule already
  has a `when Resources[*].Type == "AWS::X::Y"` guard at the rule level, the block body
  should assert on Properties without re-filtering by Type. Ref:
  https://docs.aws.amazon.com/cfn-guard/latest/ug/writing-rules.html
- **Relational ops on intrinsic values crash cfn-guard**: cfn-guard cannot compare
  an intrinsic-function value (`!Ref`, `!GetAtt`, `!Sub`, `!ImportValue`,
  `!FindInMap`, `!Join`) against ANY scalar literal — it hard-errors with
  `ComparisonError: PathAwareValues are not comparable map, <type>` (exit 19). This
  applies to **every** relational operator, not just string equality:
  - String: `!=` / `==` — error `[map, String]`
  - Numeric: `>` / `<` / `>=` / `<=` / `!=` / `==` — error `[map, int]`
  - Boolean: `!=` / `==` — error `[map, Bool]`

  Compliant templates routinely wire KMS ARNs, role ARNs, log-group names, and
  numeric thresholds through intrinsics (parameter overrides, stack outputs,
  SSM parameter lookups), so any relational comparison becomes a silent
  timebomb: it fails only when the template is parameterized, which is exactly
  the production case. Reachability-masked bugs (rules inside a `when` path the
  compliant template never triggers) compound the problem.
  - Scalar present and non-null → `Properties.X exists`
  - Collection present with ≥1 element → `Properties.X !empty` (collection-only —
    it cannot test an empty string)
  - Enum-style membership on a string or number → `Properties.X in [...]`
    (only when X is a literal in the compliant template — confirm by reading
    the template before writing the rule)
  - Only use `!= ""` / `!= null` / `> 0` / `< N` when the value is a **literal
    in every compliant template** for this service. When in doubt, use `exists`
    and push the threshold check to Checkov / OPA / Config Rule, which accept
    intrinsics as opaque refs.

  Ref: https://docs.aws.amazon.com/cfn-guard/latest/ug/writing-rules.html
  (`exists`, `empty`, operator semantics).
- **Array iteration `[*] in [...]` must be guarded by `!empty`**: cfn-guard 3.x raises
  `RequiredPropertyError` (exit 19) when evaluating `Properties.X[*] in [...]` against an
  empty array. This produces a FALSE-POSITIVE FAIL on compliant templates where the array
  is legitimately empty (e.g., `Capabilities.Add: []`). Wrap the iteration in a
  `when ... !empty` clause:
  ```
  # WRONG — FAILS when Add is []:
  rule r { AWS::ECS::TaskDefinition {
      Properties.ContainerDefinitions[*].LinuxParameters.Capabilities.Add[*] in ["OK"]
  }}
  # CORRECT — skips the iteration when the array is empty:
  rule r { AWS::ECS::TaskDefinition {
      Properties.ContainerDefinitions[*].LinuxParameters.Capabilities {
          when Add !empty { Add[*] in ["OK"] }
      }
  }}
  ```
  The rule correctly treats "array is absent or empty" as "nothing to violate" rather than
  an iteration error.
- **Authorizer field completeness**: When validating authorizer controls, guard rules MUST
  check ALL accepted configuration fields. Verify the exact set of accepted fields via
  `aws <service> <command> --generate-cli-skeleton` — do NOT assume fields exist based on
  documentation alone. Only generate rules for fields the API actually accepts.
- **Enum value accuracy**: Guard rules, OPA policies, and Checkov custom policies MUST use
  the EXACT enum values for each parameter. Before writing any enum comparison:
  1. Find the parameter in `validated.json` `api_surface.operations[].parameters[]` and use
     the values in `parameters[].enum`.
  2. Also consult the relevant mitigation's `feasibility_note` and the parameter's
     `enrichment_opportunities[]` / `condition_keys[]` — these sometimes list acceptable
     values the raw enum does not.
  3. Use the values verbatim — do NOT invent camelCase or SCREAMING_SNAKE_CASE transforms
     (e.g., `IAM_AUTH` ≠ `IAM`, `awsvpc` ≠ `AWSVPC`). A wrong enum silently neutralises the
     rule (Guard skips, OPA passes false, Checkov never triggers).

  CHECK-14b enforces SCREAMING_SNAKE `[...]` list-form membership at hook time. Equality-form
  (`== "..."` / `!= "..."`), pure-miss lists, and camelCase values are NOT hook-checked —
  they remain your responsibility.

### CloudFormation Hooks Policy (`proactive/cfn-hooks-policy.json`)
- Use `awsiac` MCP to confirm resource type supports CFN Hooks
- **Header completeness**: The `CONTROLS` header MUST list ALL proactive controls, not just a
  subset. The hook executes the Guard file which implements all proactive controls, so the hook
  header must claim all of them.

### Checkov Config (`proactive/checkov-config.yaml`)
- Check IDs mapping to controls in this cell
- **Custom policy directory**: If any custom check IDs are referenced (e.g., `CKV_AWS_<SERVICE>_*`),
  the `custom-policies-dir` MUST point to a directory that exists and contains the actual policy
  definitions. Create `proactive/custom-policies/` and write a `.py` or `.yaml` policy file for
  each custom check. A Checkov config referencing non-existent custom policies will fail at runtime.
  ```bash
  mkdir -p .service-approval/<slug>/05-generate/proactive/custom-policies
  ```
  Each custom policy file must define the check ID, resource type, and evaluation logic.

### OPA Account Policies (`proactive/opa-policies/<ResourceType>.rego`)
- One `.rego` file per resource type
- **Authorizer field completeness**: When validating authorizer controls, OPA deny rules
  MUST check ALL accepted configuration fields. Verify the exact set via
  `aws <service> <command> --generate-cli-skeleton`. Generate separate deny blocks for
  each required field — do not generate checks for fields the API does not accept.

### Access-log exemption tag contract (S3)

The `CTRL-ACC-PRO-002` rule (require `aws_s3_bucket_logging` companion on every
`aws_s3_bucket`) MUST provide an exemption for log-target buckets. Log sink buckets
cannot log to themselves — the companion requirement would force a recursion. The
canonical exemption is a tag with key `"bucket-role"` and value `"log-target"`,
checked by a predicate named `is_log_target(tags)`:

```rego
deny contains msg if {
    some rc in input.resource_changes
    rc.type == "aws_s3_bucket"
    not has_logging
    not is_log_target(rc.change.after.tags)
    msg := sprintf("CTRL-ACC-PRO-002: aws_s3_bucket %v requires logging (aws_s3_bucket_logging) unless tagged bucket-role=log-target", [rc.address])
}

is_log_target(tags) if {
    tags["bucket-role"] == "log-target"
}
```

`generate-iac` emits this exact tag on any generated access-log sink bucket (see
`generate-iac/SKILL.md` "Logging target buckets (S3)"). If you change the tag key,
the tag value, or the predicate name here, update `generate-iac/SKILL.md` in lockstep —
both skills must agree.

### Plan-time unknown attributes (Terraform after_unknown)

When an OPA rego deny rule checks a Terraform resource attribute value that may
reference a sibling resource being created in the same plan (e.g.,
`kms_master_key_id = aws_kms_key.bucket.arn` where the KMS key is net-new), the rule
MUST accept both forms Terraform emits:

1. **Known at plan time** — attribute value present in `change.after`.
2. **Known after apply** — attribute value absent from `change.after`, recorded in
   `change.after_unknown` as `true`. This happens whenever an attribute references a
   sibling resource being created in the same plan — typically: KMS keys, SNS topics,
   CloudWatch log groups, IAM roles, security groups, VPC endpoints, S3 buckets.

Without the `after_unknown` branch, the rego incorrectly denies every fresh
`terraform plan` where the referenced resource is created inline. The rule is
service-agnostic: apply the two-branch pattern to ANY rego rule that checks a
cross-resource reference attribute.

Helper pattern (pass the whole `rc.change`, not just `rc.change.after`, so both
branches are reachable):

```rego
# Example: CTRL-ACC-PRO-001 SSE-KMS rule
deny contains msg if {
    some rc in input.resource_changes
    rc.type == "aws_s3_bucket_server_side_encryption_configuration"
    not has_kms(rc.change)
    msg := sprintf("CTRL-...: %v must use aws:kms with a CMK", [rc.address])
}

# Branch 1: concrete kms_master_key_id in `after`
has_kms(change) if {
    some rule in change.after.rule
    some sse in rule.apply_server_side_encryption_by_default
    sse.sse_algorithm in {"aws:kms", "aws:kms:dsse"}
    sse.kms_master_key_id != ""
}

# Branch 2: plan-time-unknown marker in `after_unknown`
has_kms(change) if {
    some rule in change.after.rule
    some sse in rule.apply_server_side_encryption_by_default
    sse.sse_algorithm in {"aws:kms", "aws:kms:dsse"}
    some unknown_rule in change.after_unknown.rule
    some unknown_sse in unknown_rule.apply_server_side_encryption_by_default
    unknown_sse.kms_master_key_id == true
}
```

Helper signatures MUST take `rc.change` (not `rc.change.after`) when they cover
attributes that could be cross-referenced. Existing rego rules using the old
`has_X(after)` signature continue to work for attributes never referenced across
resources; update signatures when migrating a rule to support cross-referenced
attributes.

---

## Account × Preventive

### Permission Boundary (`preventive/permission-boundary.json`)

**Generate ONLY if `mapping-results.json` contains at least one control with
`mechanism == "IAM Permission Boundary"`.** If no such control exists, SKIP
this file entirely — do NOT emit a placeholder and do NOT invent a control ID
(e.g., `CTRL-ACC-PRV-BOUNDARY`). The resulting artifact must reference ONLY
control IDs present in mapping-results.

- Limit role permissions to needed service actions
- Use `awsknowledge` MCP for real action names
- **Globally-scoped IAM actions MUST be in their own Statement with `Resource: "*"`**:
  Some IAM actions (notably `ecr:GetAuthorizationToken`, `sts:GetCallerIdentity`,
  `sts:AssumeRole` against account-wide scope, `cloudtrail:DescribeTrails` when
  service-wide) do NOT accept resource-level permissions and must be granted
  `Resource: "*"`. Grouping them in a Statement whose `Resource` lists ARNs
  (e.g., `arn:aws:ecr:{region}:{account}:repository/*`) produces a boundary that
  silently denies them because AWS evaluates per-action resource compatibility.
  Split such actions into their own Allow Statement with `Resource: "*"` and
  document the reason in a `Sid`. Verify against the SAR page: actions whose
  Resource types column is empty are global-only and cannot be scoped.

**IAM action validation (CRITICAL):** Before generating any IAM policy artifact (SCP,
permission boundary, IAM policies, resource policies, VPCE policies), verify that every
`Action` value exists in `validated.json` `api_surface.operations[].operation` OR is listed
as a permission-only action in `capabilities.iam.permission_only_actions[]`. Permission-only
actions (e.g., `InvokeGateway`) are valid IAM-evaluated actions without API endpoints — they
CAN be used in policies. Common error: inventing action patterns (e.g., `<prefix>:Describe*`)
when the service only supports `Get*` and `List*` for read operations. Check the service's
IAM actions via `awsknowledge` MCP or
the IAM Actions Reference. If the service prefix does not support a particular action verb,
do not generate it. This applies to ALL policy files: `scp-policy.json`, `iam-policies.json`,
`permission-boundary.json`, `resource-policy.json`, `vpce-policy.json`.

### IAM Policies and Trust Policies (`preventive/iam-policies.json`)

**Generate ONLY if `mapping-results.json` contains at least one control with
`mechanism ∈ {"IAM Policy", "IAM Trust Policy"}`.** If no such control exists,
SKIP this file entirely — do NOT emit a placeholder and do NOT invent a control
ID (e.g., `CTRL-ACC-PRV-EXEC-ROLE`). The `controls` field of `_metadata` must
reference ONLY IDs present in mapping-results.

- Generate standalone IAM policy and trust policy documents for ACC-PRV controls with `mechanism`
  of "IAM Policy" or "IAM Trust Policy"
- Each control gets a named policy document in the JSON file
- Trust policies: include `Condition` block for confused deputy protection
- IAM policies: scope to specific resource ARN patterns, not `*`
- **Do NOT skip IAM Policy / Trust Policy controls that ARE in mapping-results**
  — they are distinct from the permission boundary and implement specific scoped
  access patterns (execution role policies, trust relationships). A mapped
  IAM-Policy-mechanism control with no standalone artifact is a generation gap.
  (This directive catches mapper omissions of mapped controls; it does NOT
  sanction inventing control IDs when mapping is empty — see the gate above.)

---

## Resource × Proactive

**Scope is determined by mapping-results.json, NOT by this heading.** CloudFormation Guard
rules map to scope=ACC by default per the map-generate-controls mechanism→scope table (they
run at the account's CFN deploy or as account-scoped Hooks, not attached to an individual
resource ARN). A RES-PRO control exists only if the mechanism is genuinely resource-attached
(rare for Guard — more typical for mechanisms like resource-based policies that also enforce
at create time).

Before generating any artifact in this section, look up the control in
`mapping-results.json`. If its `scope` is `ACC`, emit the rule under the Account × Proactive
section instead — do NOT force-write a `CTRL-RES-PRO-*` ID just because this section is
titled "Resource × Proactive".

If resource-scoped proactive controls DO exist in mapping, append them to
`proactive/cfn-guard-rules.guard` with a comment header separating them from account-level
rules and use the control's exact mapping ID for the rule name.

---

## Resource × Preventive

### Resource Policy (`preventive/resource-policy.json`)

**Inclusion is data-driven, not a hardcoded service list.** Three branches based
on `validated.json.capabilities.iam.resource_policies_supported` AND
`mapping-results.json`:

**Branch 1 — Service supports RBP AND mapping has a control:**
Generate the full policy. Required when
`resource_policies_supported: true` AND `mapping-results.json` contains at least
one control with `mechanism ∈ {"Resource Policy", "Resource-Based Policy"}`.

**Branch 2 — Service supports RBP but no control is mapped:**
SKIP the file entirely. Do NOT emit a placeholder; do NOT invent a control ID
(e.g., `CTRL-RES-PRV-RESPOL`). The mapping is the authoritative source of what
to generate.

**Branch 3 — Service does NOT support RBP:**
When `resource_policies_supported: false`, emit a NOT_APPLICABLE stub so that
(a) CHECK-X2 control-coverage passes for any RBP-intended control that couldn't
be rendered, (b) CHECK-X1 framework-header consistency is satisfied, and (c)
reviewers see the absence is intentional rather than a generation miss:

```json
{
  "_metadata": {
    "status": "NOT_APPLICABLE",
    "reason": "Service does not expose resource-based policies (validated.json.capabilities.iam.resource_policies_supported: false)",
    "posture": "preventative-request",
    "controls": [],
    "framework": "<copy from mapping-results.framework_header_canonical>",
    "mitigations": [],
    "generated": "service-approval v3.0.0",
    "service": "<service-name>"
  },
  "Statement": []
}
```

The stub keeps the framework header consistent across artifacts without
fabricating policy content that AWS IAM would silently ignore. Do NOT use this
stub as a shortcut when Branch 1 applies — only when RBP is genuinely
unsupported.

**Determine support from validated.json, NOT a hardcoded service list.** RBP
support changes over time (e.g., DynamoDB gained resource-based policies in
late 2024; Lambda gained function URL resource policies earlier; EventBridge
gained bus resource policies). Read
`validated.json.capabilities.iam.resource_policies_supported` — that flag is
populated by Phase 0 Assess from the AWS documentation and Phase 2 Validate
from MCP verification.

**When generating (Branch 1):**

- Use `awsknowledge` MCP for real ARN patterns and action names
- **MANDATORY confused deputy protection on resource-based policies**: EVERY resource-based
  policy Statement (policies attached TO a resource like Runtime or Gateway) MUST include
  `"Condition": { "StringEquals": { "aws:SourceAccount": "${AWS::AccountId}" } }` at minimum.
  For service-to-service calls, also add `"ArnLike": { "aws:SourceArn": "arn:aws:<service>:<region>:<account>:*" }`.
  A resource-based policy without confused deputy conditions is a security gap.
- **VPC endpoint policies are different**: VPCE endpoint policies control who can use the
  endpoint, not who can access the resource. Use `aws:PrincipalOrgID` for org scoping, NOT
  `aws:SourceAccount`/`aws:SourceArn` (confused deputy conditions do not apply to endpoint policies).

### KMS Key Policy (`preventive/kms-key-policy.json`)

**Generate ONLY if `mapping-results.json` contains at least one control with
`mechanism == "KMS Key Policy"`.** If no such control exists, SKIP this file
entirely — do NOT emit a placeholder and do NOT invent a control ID (e.g.,
`CTRL-RES-PRV-KMS`). "Encryption capability exists in validated.json" is not a
sufficient trigger; mapping decides whether a KMS key policy is in scope.

- Include `kms:ViaService` condition keyed to the caller service

### RCP (`preventive/rcp-policy.json`)

**Generate ONLY if `mapping-results.json` contains at least one control with
`mechanism == "RCP"` AND `rcp_expressible: true` in validated.json.** If no
mapped RCP control exists, SKIP this file entirely — do NOT emit a placeholder
and do NOT invent a control ID (e.g., `CTRL-RES-PRV-RCP`). Only when a control
is mapped to RCP but the service is not RCP-expressible (`rcp_expressible:
false`) do you write `_metadata.rcp_gap` and skip the policy body.
- **Gap placeholder metadata**: Even gap/skip files MUST include complete `_metadata` with ALL
  required fields (scope, layer, controls, framework, mitigations, generated, service). The
  `controls` field can be `[]` for gaps, but `framework` and `mitigations` MUST be populated
  with the full union lists. A gap file with missing metadata fields breaks downstream validation.
- Always `"Effect": "Deny"` and `"Principal": "*"`
- `"BoolIfExists": {"aws:PrincipalIsAWSService": "false"}`
- `"StringNotEquals": {"aws:PrincipalOrgID": "${ORG_ID}"}`

### Declarative Policy (`preventive/declarative-policy.json`)
Only if `declarative_policy_expressible: true`.

### Backup Policy (`preventive/backup-policy.json`)
Only if `backup_policy_applicable: true`.

---

## Apply Enrichment Opportunities

For each `enrichment_opportunity` in `validated.json` with `verified: true`:
- Find the referenced control in already-generated artifacts
- Add the enhancement (inject condition key, add `kms:ViaService`, etc.)
- Generate concrete IAM policy example inline

---

## Validate Generated Artifacts

Artifact validation runs automatically via PostToolUse hook (validate_controls.py) and Stop hook (validate_cross.py Check X9).

## Completion checklist (REQUIRED — run before returning)

Before declaring the run complete, iterate this checklist. Each mandatory artifact
is in one of three terminal states:
- **EMITTED** — file written to disk, references the expected control IDs via header comment
- **N/A** — explicit gate evaluated false per the skill rule (document which gate)
- **SKIPPED-ERROR** — run aborted before this artifact could be generated (STOP and report)

Check every row. Do NOT return success if any row is SKIPPED-ERROR or if a row is
both expected (mapping-results has a matching control) and not EMITTED.

| Artifact | Gate (emit only if…) | Expected when |
|---|---|---|
| `preventive/scp-policy.json` | control has `mechanism == "SCP"` | always for SAR-eligible services |
| `preventive/scp-provisioning.json` | control has `mechanism == "SCP"` with provisioning-time intent | platform services with admin/delegation controls |
| `preventive/rcp-policy.json` | `rcp_expressible: true` AND RCP-mechanism control | rare, service-dependent |
| `preventive/declarative-policy.json` | `declarative_policy_expressible: true` | only EC2/VPC/EBS today |
| `preventive/ai-optout-policy.json` | `ai_optout_applicable: true` | Bedrock/Comprehend/etc. |
| `preventive/backup-policy.json` | `backup_policy_applicable: true` | service has AWS Backup integration |
| `preventive/permission-boundary.json` | control has `mechanism == "IAM Permission Boundary"` | any service with Acc×Preventive |
| `preventive/iam-policies.json` | control has `mechanism == "IAM Policy"` (trust policy, etc.) | SLR/trust-policy controls |
| `preventive/resource-policy.json` | control has `mechanism == "Resource Policy"` on primary service | services with RBP |
| `preventive/vpce-policy.json` | control has `mechanism == "VPCE Policy"` | services with VPC endpoints + endpoint-policy support |
| `preventive/kms-key-policy.json` | control has `mechanism == "KMS Key Policy"` | services with CMK consumption |
| `proactive/tag-policy.json` | any control requires tag enforcement | always (most services) |
| `proactive/cfn-guard-rules.guard` | any resource-scope control exists | always for SAR-eligible services |
| `proactive/cfn-hooks-policy.json` | any provisioning-time check uses CFN Hooks | always for SAR-eligible services |
| `proactive/checkov-config.yaml` + custom-policies/ | account-scope static-analysis controls | always for SAR-eligible services |
| `proactive/opa-policies/<ResourceType>.rego` | per resource type with account-scope OPA controls | one per distinct resource type in validated.assets[] |
| `proactive/opa-policies/org-policy.rego` | any org-wide OPA rule needed | platform services, tag-rule enforcement |
| `preventive/compensating-controls-documentation.json` | any control has no feasible mechanism (RCP/declarative/etc. gate = false) | rare, document-only |

Before returning, emit a concise report:

```
Preventive completion: N EMITTED, K N/A (gated), 0 SKIPPED-ERROR
  Emitted: scp-policy.json, permission-boundary.json, kms-key-policy.json, ...
  N/A (gate false):
    - declarative-policy.json (declarative_policy_expressible=false)
    - ai-optout-policy.json (ai_optout_applicable=false)
    - rcp-policy.json (rcp_expressible=false)
```

If K SKIPPED-ERROR > 0, do NOT claim success — report the missing artifacts and
the reason (context exhaustion, subagent timeout, upstream data missing, etc.)
so the orchestrator can retry or adjust.

## Print Summary

```
Generate (preventive/proactive) complete:
  Org×Proactive:    tag-policy, OPA org policy [, scp-provisioning]
  Org×Preventive:   scp-policy [, ai-optout-policy]
  Acc×Proactive:    cfn-guard-rules, cfn-hooks-policy, checkov-config, OPA policies
  Acc×Preventive:   permission-boundary
  Res×Proactive:    cfn-guard resource rules
  Res×Preventive:   resource-policy [, kms-key-policy] [, rcp-policy]
  Output: .service-approval/<slug>/05-generate/preventive/, .service-approval/<slug>/05-generate/proactive/
```
