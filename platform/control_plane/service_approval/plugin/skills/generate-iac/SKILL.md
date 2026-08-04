---
name: generate-iac
description: Generate compliant IaC templates in all 4 formats — modular Terraform, CDK TypeScript, CloudFormation YAML, and CDK for Terraform. Uses parameter coverage matrix from mapping-results.json and API surface from validated.json.
disable-model-invocation: false
argument-hint: '[--service=<name>] [--include-unverified]'
---

# Service Approval — Generator: IaC Templates

Generate compliant infrastructure-as-code templates in all 4 required formats from the
Controls Matrix. Each template implements ALL controls as properties/variables on the
compliant resource.

**Output:** `.service-approval/<slug>/05-generate/iac/`

This is one of 3 focused generate sub-skills. Each writes to separate directories.

---

## Prerequisites

```bash
test -f .service-approval/<slug>/04-map/mapping-results.json && echo "mapping-results: OK" || echo "ERROR"
test -f .service-approval/<slug>/03-validate/validated.json && echo "validated: OK" || echo "ERROR"
```

Create directory structure:
```bash
mkdir -p .service-approval/<slug>/05-generate/iac/modules/_shared
for asset in $(python3 -c "import json; d=json.load(open('.service-approval/<slug>/03-validate/validated.json')); [print(a['name'].lower().replace(' ','-')) for a in d['assets']]"); do
  mkdir -p ".service-approval/<slug>/05-generate/iac/modules/${asset}"
done
```

Load controls and API surface:
```bash
python3 -c "
import json
mr = json.load(open('.service-approval/<slug>/04-map/mapping-results.json'))
vj = json.load(open('.service-approval/<slug>/03-validate/validated.json'))
print(f'Controls: {len(mr[\"controls\"])}')
print(f'Assets: {len(vj[\"assets\"])}')
print(f'API operations: {len(vj[\"api_surface\"][\"operations\"])}')
fw = mr['framework']
if isinstance(fw, dict): print(f'Framework: {fw[\"name\"]}')
"
```

## Artifact Header Template

Every generated file MUST include:
```
# SCOPE: resource
# LAYER: proactive
# POSTURE: preventative-proactive
# CONTROLS: <all control IDs>
# FRAMEWORK: <framework-name> — <FULL sorted union of ALL MAPPED objective IDs>
# MITIGATIONS: <all mitigation IDs>
# GENERATED: service-approval v3.0.0
# SERVICE: <service-name>
```

For JSON/YAML files, set `_metadata.posture` to `"preventative-proactive"` (IaC templates
implement preventative-proactive controls — they validate before any AWS call). For TF
`.tf` files, CDK `.ts` files, and the CFN `.yaml`, include the `# POSTURE:` comment in
the header block. CHECK-15 will verify `_metadata.posture == "preventative-proactive"`
for files under `iac/**`.

The `FRAMEWORK` line MUST be copied VERBATIM from
`mapping-results.json.framework_header_canonical` — `scripts/map-assemble.py` precomputes
this sorted-union string once so every artifact emits the identical header. Do NOT re-derive
the list from `_metadata.controls[]` or from per-control `framework_objectives[]`. The
identical string goes in EVERY IaC artifact including per-module TF files. CHECK-X1
(`validate_cross.py:120`) asserts header identity across artifacts — differing headers
fail the hook.

---

## Cross-generator consistency (MANDATORY)

The compliant IaC templates this skill writes MUST pass every rule in the
sibling `proactive/cfn-guard-rules.guard` file produced by `generate-preventive`.
Tier 1 runs cfn-guard against the CFN template using these rules; if the
compliant template fails its own guard rules it is self-inconsistent and
Tier 1 FAILs.

Before finalising any IaC template:

1. **Read the generated guard rules.** Open `proactive/cfn-guard-rules.guard`
   and enumerate every assertion. Three shapes matter:
   - `<Path>.<Prop> exists` — the template MUST set `<Prop>` on `<Path>`.
   - `<Path>.<Prop> == "<literal>"` or `<Path>.<Prop> in ["<a>","<b>"]` — the
     template MUST set `<Prop>` to a value the rule accepts.
   - `<Path>.<Prop> !empty` — the template MUST set `<Prop>` to a non-empty value.
2. **Reflect each assertion in every IaC format.** The CFN template is the
   format cfn-guard scores, but Terraform, CDK TypeScript, and CDKTF MUST
   mirror the same properties on the same resources (different syntax, same
   semantics). Do NOT write a CFN template that passes the rules and a TF
   module that omits the properties.
3. **Common gotcha — chained properties.** When a rule asserts
   `Parent.Child.Grandchild exists`, every intermediate key must be present
   in the template. Example: if the rule is
   `AWS::ECS::Cluster.Properties.Configuration.ManagedStorageConfiguration.FargateEphemeralStorageKmsKeyId exists`,
   every intermediate key (`Configuration`, `ManagedStorageConfiguration`,
   `FargateEphemeralStorageKmsKeyId`) must appear in the Cluster's Properties.
4. **Verify the guard rule's property path against the CFN schema before
   mirroring it.** The guard rule is not authoritative about where a property
   lives in the CFN schema — the generator that wrote it may have copied the
   API `path` from `validated.json`, which does not always match CFN. Before
   adding a property to the compliant template to satisfy a rule, confirm the
   resource type actually supports that property at
   https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/AWS_{cfn_prefix}.html
   or via `awsiac` MCP. If the CFN schema rejects the property (cfn-lint
   E3002), the guard rule is wrong, not the template — fix the rule in
   `proactive/cfn-guard-rules.guard` to target the correct resource type and
   path, then mirror that into every IaC format.
5. **When a rule is too strict for a reasonable default**, treat the rule as
   authoritative (after step 4 confirms the path): adjust the template to
   satisfy it, or split the control into "always" vs "conditional" rules in
   `generate-preventive`. Never leave the template failing its own rules
   "because the default is reasonable".

This cross-check is inherent in Tier 1 smoke validation — but do it at
write time, not after the fact. If you discover a mismatch during Tier 1,
fix the template (or fix the rule, if the rule is wrong), and re-run.

### Per-resource-type property names may differ within one service

CFN property names are defined per RESOURCE TYPE, not per service. A single
AWS service can use different property names for the "same" concept on
different resource types. Do NOT assume uniform naming across a service's
resources.

Concrete case surfaced in production runs with multi-resource encryption:
- `AWS::<Service>::<ResourceA>.EncryptionKeyArn` — KMS key for one resource type
- `AWS::<Service>::<ResourceB>.KmsKeyArn` — KMS key for another resource type

Both properties encrypt with a customer-managed KMS key, but the property
names differ. Other examples across AWS: `KmsKeyId` vs `KmsKeyArn` vs
`KMSMasterKeyId` vs `EncryptionKeyArn` appear across S3, DynamoDB, SQS,
SNS, KMS, Lambda, and various analytics services.

**Before writing any cfn-guard rule or CFN/TF/CDK property assignment**,
look up the exact property name for **each** resource type in the CFN
Template Reference page (or `awsiac` MCP). When a single rule targets
multiple resource types (e.g., "require CMK on all service resources"),
split it into per-type blocks:

```
rule cmk_required_resource_a {
    AWS::<Service>::<ResourceA> {
        Properties.EncryptionKeyArn exists
    }
}

rule cmk_required_resource_b {
    AWS::<Service>::<ResourceB> {
        Properties.KmsKeyArn exists
    }
}
```

NOT a single rule using one property name for both — the guard rule will
false-pass one resource type while false-failing the other.

Mirror the same per-resource-type awareness in Terraform modules, CDK
constructs, and CDKTF.

### maxItems=1 array constraint

**This rule applies ONLY when the authoritative CFN registry schema explicitly
declares `"maxItems": 1` on the target field.** Do NOT apply it based on
intuition about the service's "tenancy model" or "single-tenant-per-resource"
feel. Service topology does not imply the constraint — look up the schema.

Authoritative check (replaces the Template Reference page for this specific
question):

```
curl -sS "https://schema.cloudformation.<region>.amazonaws.com/aws-<service>-<resource>.json" | \
  jq '.. | objects | select(has("maxItems")) | {prop: input_filename, max: .maxItems}'
```

Or via `awsiac` MCP with explicit inspection of the target property.

When `maxItems == 1` IS declared, the CFN schema rejects any array with more
than one element — multi-AZ / multi-zone / multi-instance posture MUST be
expressed by creating multiple resources of that type, NOT by adding multiple
entries to the single-item array.

**Confirmed maxItems=1 cases** (verified against live CFN registry schemas):
- `AWS::DataSync::Agent.SubnetArns` and `.SecurityGroupArns` — multi-AZ requires
  multiple Agent resources.

**Counter-examples** (look like they might fit but don't):
- `AWS::Transfer::Server.EndpointDetails.SubnetIds` — no `maxItems` declared.
  Multi-AZ is expressed as a single Server with ≥2 SubnetIds. Do NOT split into
  multiple Server resources.

When in doubt, check the schema before applying the rule. An incorrect
application produces broken multi-resource templates for services that just
want array entries.

For these cases, the sibling cfn-guard rule MUST assert resource count, not
array cardinality:

```
# WRONG — fails on every template, because maxItems=1
rule multi_az when Resources.*[ Type == "AWS::DataSync::Agent" ] !empty {
    Resources.*[ Type == "AWS::DataSync::Agent" ] {
        Properties.SubnetArns[1] exists   # unreachable
    }
}

# RIGHT — asserts two Agent resources instead
rule multi_az {
    let agents = Resources.*[ Type == "AWS::DataSync::Agent" ]
    %agents !empty
    # Each Agent is pinned to one subnet/AZ by schema; multi-AZ ⇒ 2+ Agents
    # (enforce count via a guard-level check in the consuming pipeline, or
    # document the per-resource expectation here and pair with an OPA rule)
}
```

Add a comment in the template near each such resource noting the
`maxItems=1` constraint and why the template emits multiple resources.
This prevents a future edit from collapsing them into "one resource with
two subnets" and silently breaking deploy.

---

## Step 1: Parameter Coverage Matrix

For every control in `controls[]`, extract `parameters_controlled[]`. Build a matrix:

| Control ID | Scope | Category | Parameter | Template(s) |

Cross-check: every parameter must appear as a variable/property in ALL 4 templates.
After generating each template, diff its parameters against this matrix.

---

## Step 2: Resource Policy Lifecycle

For every control with `parameters_controlled[]` referencing `PutResourcePolicy`:
- Generate resource policies for EVERY applicable resource type
- Count distinct resource policy resources generated vs `resource_types` from PutResourcePolicy
- Document any gaps as KNOWN GAP

---

## IMPORTANT: Generation Order for Context Efficiency

All 4 formats are REQUIRED. To avoid running out of context before completing all formats,
generate in this order:

1. **CDK TypeScript** (Step 4) — single file, compact
2. **CloudFormation YAML** (Step 5) — single file, compact
3. **CDK for Terraform** (Step 6) — single file, compact
4. **Modular Terraform** (Step 3) — multi-file, largest

This ensures the 3 single-file formats are written first. If context pressure is high,
the Terraform modules can be generated with less verbose comments while still including
all required parameters and control ID annotations.

---

## Cross-Format Quality Rules (apply to ALL 4 formats)

These rules MUST be enforced in every template format — not just one:

1. **Authorizer field completeness**: Generate ALL accepted fields on authorizer configuration.
   Verify the exact set of accepted fields via `aws <service> <command> --generate-cli-skeleton`
   or the SDK model — do NOT assume fields exist based on documentation alone. Only generate
   variables/parameters for fields the API actually accepts. Common error: generating a field
   the API silently ignores (wasted variable) or missing a field the API requires.

2. **Enum value accuracy in IaC templates (Rule C3 — API-driven)**: When generating
   variables or parameters with enum constraints (CFN `AllowedValues`, TF variable
   `validation` blocks, CDK runtime checks, CDKTF variable defaults), use ONLY the exact
   values from `validated.json.api_surface.operations[].parameters[].enum`. This field
   is the single source of truth for the current service run — do NOT re-scrape AWS
   docs. Copy values verbatim. Common error: using `IAM` instead of `IAM_AUTH` or
   `CustomJWT` instead of `CUSTOM_JWT_AUTHORIZER` for authorizer type enums. Any
   enum-style literal list (`in [...]`, `AllowedValues: [...]`, `contains([...], var.x)`,
   `validation { condition = contains([...], var.x) }`) must match `parameters[].enum`
   exactly. Validator CHECK-14b enforces this at hook time across all 4 IaC formats —
   an enum-literal value not in any parameter's enum fails the hook.

   Min/max/pattern constraints come from the SAME source: `parameters[].min`,
   `parameters[].max`, `parameters[].pattern`. Do not invent bounds.

3. **VPC Endpoint Condition on Network-Scoped IAM Policies**: When a resource has VPCE-based
   network controls, the IAM execution role policy SHOULD include `aws:SourceVpce` condition
   when a VPC endpoint ID is provided. This applies to Terraform modules and CDK constructs.

4. **KMS key policy must grant all consuming services**: When a KMS CMK is used by multiple
   AWS services (e.g., Lambda env vars + CloudWatch Logs + SQS DLQ), the key policy MUST
   include a separate statement for EACH service principal. Common omission: creating a KMS
   key for Lambda but only granting `lambda.amazonaws.com` — then the CloudWatch Log Group
   creation fails with `AccessDeniedException`. Required grants:
   - `logs.{region}.amazonaws.com` for CloudWatch Logs encryption (with `kms:EncryptionContext:aws:logs:arn` condition)
   - `sqs.amazonaws.com` for SQS DLQ encryption (if DLQ uses the same key)
   - Account root `arn:aws:iam::{account}:root` for key administration
   This applies to ALL 4 IaC formats.

   **MANDATORY pre-write verification (applies to ALL 4 formats)**: Before finalizing any
   template that defines a KMS key, enumerate every resource in the template that references
   the key by `kms_key_id` / `KmsKeyId` / encryption-key ARN / `kmsMasterKeyId`. For each
   consumer, the key policy MUST contain a Statement with the matching service principal,
   the actions the service needs, AND the conditions AWS requires. Principal alone is not
   enough — AWS rejects calls that lack the correct action or encryption-context condition
   (e.g., Fargate `UpdateCluster` returns `InvalidParameterException: Insufficient key
   permissions provided to Fargate service principal` if the actions or conditions are
   wrong, even when the principal is `fargate.amazonaws.com`).

   | Consumer | Service principal | Required actions | Required conditions |
   |---|---|---|---|
   | `aws_cloudwatch_log_group` / `AWS::Logs::LogGroup` | `logs.{region}.amazonaws.com` | `kms:Encrypt`, `kms:Decrypt`, `kms:ReEncrypt*`, `kms:GenerateDataKey*`, `kms:DescribeKey` | `ArnLike kms:EncryptionContext:aws:logs:arn = arn:aws:logs:{region}:{account}:log-group:*` |
   | `aws_sqs_queue` / `AWS::SQS::Queue` | `sqs.amazonaws.com` | `kms:Encrypt`, `kms:Decrypt`, `kms:GenerateDataKey*` | `StringEquals aws:SourceAccount = {account}` |
   | `aws_sns_topic` / `AWS::SNS::Topic` | `sns.amazonaws.com` | `kms:Encrypt`, `kms:Decrypt`, `kms:GenerateDataKey*` | `StringEquals aws:SourceAccount = {account}` |
   | `aws_lambda_function` env vars | `lambda.amazonaws.com` | `kms:Decrypt` | `StringEquals aws:SourceAccount = {account}` |
   | `aws_ecs_cluster` ECS service use (managed storage) | `ecs.amazonaws.com` | `kms:Decrypt`, `kms:Encrypt`, `kms:DescribeKey`, `kms:GenerateDataKey`, `kms:CreateGrant` | `StringEquals aws:SourceAccount = {account}` |
   | `aws_ecs_cluster` Fargate ephemeral storage (stmt 1) | `fargate.amazonaws.com` | `kms:GenerateDataKeyWithoutPlaintext` | `StringEquals kms:EncryptionContext:aws:ecs:clusterAccount = {account} AND aws:ecs:clusterName = {cluster_name}` |
   | `aws_ecs_cluster` Fargate ephemeral storage (stmt 2) | `fargate.amazonaws.com` | `kms:CreateGrant` | `StringEquals` (both encryption-context keys above) AND `ForAllValues:StringEquals kms:GrantOperations = ["Decrypt"]` |
   | `aws_ecs_cluster` Fargate operator (stmt 3) | account root (`arn:aws:iam::{account}:root`) | `kms:DescribeKey` | none |

   Ref for Fargate ephemeral storage policy:
   https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-create-storage-key.html

   Build the grant list BEFORE writing the KMS resource; verify after writing by scanning the
   template for every consumer reference. If any consumer lacks a grant OR grants the wrong
   actions/conditions, the template is invalid — regenerate. Deterministic post-check:
   `tools/validate/validate_kms_consumers.py` (checks principal +
   required actions + required condition keys for each consumer).

5. **Control ID annotations**: Every resource property that implements a control MUST have
   an inline comment with the control ID (e.g., `# CTRL-ACC-PRV-001`).

6. **No unused variables/parameters**: Every variable declared in a TF `variables.tf` or CFN
   `Parameters` section MUST be referenced by at least one resource. After generating, scan
   for any variable not referenced in `main.tf` or any resource block — remove it. Common
   cause: a variable was planned for a resource that ended up using a different parameter name.

7. **Cross-format parameter parity**: After generating all 4 formats, verify that the same set
   of user-configurable parameters appears in each. The parameter coverage matrix from Step 1
   is the source of truth — every format must cover every parameter. Only include parameters
   that the API actually accepts (verified via SDK model).

8. **Launch-type / runtime constraints**: Some resource types have properties that AWS rejects
   based on a sibling property's value — for example, Fargate ECS task definitions reject
   `LinuxParameters.Capabilities.Add` and `Privileged`. Before emitting any resource whose
   behavior depends on a launch type, runtime mode, compatibility flag, or similar selector,
   check `data/launch-type-constraints.json` for forbidden properties.
   The check flow:
   - Look up the resource's CFN type (e.g., `AWS::ECS::TaskDefinition`) in the data file
   - If present, read the `match_property` and `match_value` (e.g., `RequiresCompatibilities` contains `FARGATE`)
   - If the template matches, omit every property listed under `forbidden_properties`
   - If the data file has no entry for the type, proceed — unknown resource types are
     not blocked, but deploy-time errors for that resource should be logged as a new
     entry for this data file

   Current entries (as of this skill version):
   - `ecs_fargate`: `AWS::ECS::TaskDefinition` with `RequiresCompatibilities: FARGATE`
     cannot set `ContainerDefinitions[*].LinuxParameters.Capabilities.Add` or
     `ContainerDefinitions[*].Privileged`. Fargate rejects both at `RegisterTaskDefinition`
     with `ClientException`.

   New services or new launch-type surprises should be added to the data file, not inlined
   here, so the skill stays service-agnostic.

9. **Tag naming canonical form — SINGLE case (PascalCase)**: Emit each operational tag
   EXACTLY ONCE using the PascalCase form: `Owner`, `CostCenter`, `Environment`,
   `DataClassification`.

   **Why single-case, not dual:** IAM treats tag keys as **case-insensitive** (e.g.,
   `Owner` and `owner` collide). Applying both forms on an `AWS::IAM::Role`,
   `AWS::IAM::Policy`, or any IAM resource fails at CreateRole/CreatePolicy with
   `InvalidInput: Duplicate tag keys found. Please note that Tag keys are case insensitive.`
   This blocks the stack mid-deploy and has to be rolled back. Because most compliant
   templates include at least one IAM role (the Lambda/EC2/etc. execution role), any
   dual-case pattern will fail the smoke-deploy-test step on the IAM resource.

   Lambda, S3, KMS, SQS, DynamoDB tags happen to be case-SENSITIVE and would accept
   dual-case, but emitting dual-case there while IAM rejects it creates an inconsistent
   template that only deploys when IAM resources are absent. Pick one case and stay
   consistent across every resource in the template.

   SCP/Config/OPA conditions downstream MUST align on the same canonical case. The
   canonical form is PascalCase (`Owner`, `CostCenter`, `Environment`,
   `DataClassification`) because AWS Config managed `required-tags` rule and Security
   Hub standards use PascalCase. If a customer convention uses lowercase-hyphenated,
   remap at the CI/CD layer, not in the template.

   **Terraform** (`main.tf` root `locals`):
   ```hcl
   locals {
     common_tags = {
       "Owner"              = var.owner
       "CostCenter"         = var.cost_center
       "Environment"        = var.environment
       "DataClassification" = var.data_classification
     }
   }
   ```

   **CDK TypeScript**: apply `Tags.of(resource).add("Owner", ownerParam)` once per
   canonical key — NEVER add a lowercase pair. Same for CloudFormation (Tags list with
   one entry per key) and CDKTF (same locals pattern).

   If `generate-preventive` changes the required-tag set, update this rule in lockstep.
   Both skills must agree on the canonical key list AND case.

---

## Step 3: Modular Terraform (`iac/modules/`)

### Architecture

One module per asset from `validated.json` `assets[]`:
```
iac/
├── main.tf           # Root module — wires child modules
├── variables.tf      # Root-level inputs
├── outputs.tf        # Re-exports from child modules
└── modules/
    ├── _shared/
    │   └── variables.tf
    ├── <asset-1>/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    └── <asset-N>/
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```

### Module Derivation
1. Each `assets[]` entry → one module (kebab-case dir name)
2. Group controls by `resource_type` → controls for that CFN type go in that module
3. Cross-cutting controls → comment in every module

### Per-Module Contents
Each module wraps: primary resource + IAM role + KMS key + resource policy + schema gap resources.
Only pass arguments that the child module actually declares as variables. If a capability
(e.g., VPC endpoint, resource policy) is not applicable to a resource type, do NOT add
the argument to the root module block — even if other modules accept it.

### Terraform Provider Schema Check
**MANDATORY:** Before generating, call the `terraform` MCP `search_providers` tool with
the service name, then `get_provider_details` for each resource type. This determines:
- Which parameters are natively supported
- Valid enum values
- Attributes NOT on the TF schema (schema gaps)

### Schema Gap Handling
For every parameter missing from the TF provider schema:
1. Declare a `variable` in `variables.tf` with description noting the gap
2. Generate a `null_resource` with `local-exec` in `main.tf`:
   - Apply provisioner: `aws <service> update-<resource>` with the parameter
   - Destroy provisioner: reset the parameter (use `self.triggers.*` for ARN values)

### Coding Rules
- **Root ↔ module name consistency**: When the root `main.tf` passes arguments to a child module,
  the argument name MUST exactly match a `variable` name declared in that child module's
  `variables.tf`. After generating each module, re-read its `variables.tf` and verify every
  argument in the root `module {}` block uses the exact same name. Common mismatches:
  pluralization (`audiences` vs `audience`), abbreviations (`vpce_id` vs `vpc_endpoint_id`),
  and renames (`resource_policy_principals` vs `trusted_principal_arns`).
- All variables: `description` explaining the security control
- Sensitive variables: `sensitive = true`
- Optional parameters: `default = ""` + `count` on dependent resources
- **HCL block syntax**: A block that contains multiple arguments MUST place each on its
  own line. Terraform has two valid forms:
  ```
  # VALID — single-argument single-line:
  variable "x" { type = string }
  # VALID — multi-line (any number of arguments):
  variable "y" {
    type    = string
    default = ""
  }
  ```
  These are INVALID and reject at `terraform init`:
  ```
  # INVALID — space-separated, >1 argument on one line:
  variable "bad1" { type = string  default = "" }
  # INVALID — semicolon as separator (HCL uses newlines, never ;):
  variable "bad2" { type = string; default = "" }
  ```
  The error is `Invalid single-argument block definition` (for spaces) or `Invalid character`
  (for `;`). This applies to `variable`, `output`, `resource`, `module`, `locals` — every
  HCL block. When in doubt, use the multi-line form.
- **`count` / `for_each` MUST NOT reference known-after-apply values**: Terraform evaluates
  `count` and `for_each` at plan time, so the expression MUST resolve without running any
  resource. If a module gates a resource on whether an upstream resource exists, pair it
  with a STATIC boolean variable — never compare an ARN string:
    # WRONG — aws_kms_key.x.arn is known-after-apply at plan time:
    count = var.kms_key_arn != "" ? 1 : 0
    # CORRECT — static boolean the root flips in tfvars:
    variable "enable_feature" {
      type    = bool
      default = false
    }
    resource "null_resource" "x" {
      count = var.enable_feature ? 1 : 0
    }
  Terraform aborts `plan` with `Error: Invalid count argument ... the count value depends
  on resource attributes that cannot be determined until apply` whenever `count`/`for_each`
  references a variable that the root module wires to `aws_*.foo.arn`, `aws_iam_role.x.arn`,
  or any other resource output. The static-boolean pattern is also cleaner for destroy —
  flipping `enable_feature` to `false` produces a clean destruction plan.
- **Root variables MUST have defaults**: Every variable in the root `variables.tf` MUST have a
  `default` value (typically `""` for strings, `[]` for lists, `{}` for maps). Without defaults,
  `terraform plan` requires `-var` flags for every variable, making dry-run validation impossible.
  Child module variables inherit values from root module arguments and do NOT need defaults.
- `local` values for computed ARNs
- Destroy provisioners: access `self.triggers.*` NOT `var.*`, NOT `data.*`, NOT `local.*`.
  Store ALL values needed at destroy time in `triggers {}` — including `region` and `account_id`.
  At destroy time, `var`, `data`, and `local` references may not be available. Only
  `self.triggers.*` is guaranteed to resolve. Example:
  ```hcl
  triggers = {
    resource_arn = aws_resource.this.arn
    region       = data.aws_region.current.id
    account_id   = data.aws_caller_identity.current.account_id
  }
  provisioner "local-exec" {
    when    = destroy
    command = "aws <cmd> --region ${self.triggers.region}"
  }
  ```
- **Region data source**: Use `data.aws_region.current.id` NOT `data.aws_region.current.name`.
  The `name` attribute was deprecated in AWS provider v6.39.0 and replaced by `id`. Using
  `name` triggers deprecation warnings and will break in future provider versions. Apply this
  everywhere: triggers, locals, interpolations, and output values.
- `null_resource` triggers: include resource ID
- `environment` block on `local-exec`: all dynamic values (injection prevention)
- Export all resource ARNs as outputs
- Root module re-exports ALL child module outputs — every output defined in any child
  module's `outputs.tf` MUST have a corresponding re-export in the root `outputs.tf`.
  This includes ARNs, IDs, names, AND aliases (e.g., KMS key aliases). Missing re-exports
  break the module contract for consumers.

### Control ID Inline Comments
```hcl
resource "aws_<service>_<resource>" "this" {
  encryption_key_arn = local.effective_kms_arn      # CTRL-RES-PRV-001
  execution_role_arn = local.effective_role_arn     # CTRL-ACC-PRV-001
  tags               = var.tags                     # CTRL-ORG-PRO-001
}
```

### Logging target buckets (S3)

When the generated Terraform module creates an S3 bucket whose purpose is to receive
access logs from another bucket (e.g., `aws_s3_bucket.access_logs` inside an S3 bucket
module), tag it with `"bucket-role" = "log-target"`:

```hcl
resource "aws_s3_bucket" "access_logs" {
  bucket_prefix = "compliant-s3-logs-"
  tags = merge(var.common_tags, {
    purpose       = "s3-access-logs"
    "bucket-role" = "log-target"
  })
}
```

This tag is an EXEMPTION marker the OPA `CTRL-ACC-PRO-002` rule emitted by
`generate-preventive` respects (via its `is_log_target(tags)` predicate). Without this
tag, the compliant Terraform plan fails its own rego because every `aws_s3_bucket` would
be required to have an `aws_s3_bucket_logging` companion — which the log sink cannot
satisfy without recursion (it cannot log to itself).

The exemption tag name MUST match the rego rule exactly — if `generate-preventive`
changes the tag key or value, update this rule in lockstep. See
`generate-preventive/SKILL.md` "Access-log exemption tag contract" for the paired rule.

---

## Step 4: CDK TypeScript (`iac/cdk/compliant-resource.cdk.ts`)

**File layout requirements (REQUIRED for smoke-test validation)**:
- Source file MUST live at `iac/cdk/compliant-resource.cdk.ts` — NOT at `iac/compliant-resource.cdk.ts`
- The `cdk/` directory MUST also contain:
  - `package.json` with `aws-cdk-lib` and `constructs` as dependencies
  - `tsconfig.json` with `"include": ["*.ts"]` (or `["**/*.ts"]` if deeper nesting is needed) — NEVER `"../**/*.ts"` because that pulls sibling `iac/cdktf/` files into the CDK compile with the wrong peer-dep set
  - `tsconfig.json` `"exclude": ["node_modules"]`
- The validator `validate_deployable.py` runs `npm install` (or `npm ci` if a lockfile exists) inside `iac/cdk/` and then `npx tsc --noEmit`. Missing the file in the correct location, or pulling in sibling CDKTF sources, causes TS2307 module-resolution errors.

**MANDATORY:** Call `awsknowledge` MCP to check for native CFN resource type. If it exists,
prefer `CfnResource` over `AwsCustomResource`.

Use `aws-cdk-mcp-server` MCP for L2/L3 constructs.

### CDK Rules
1. `AwsCustomResource`: include BOTH `onCreate` AND `onUpdate`
2. `installLatestAwsSdk: false` on every `AwsCustomResource`
3. `PhysicalResourceId.of(<unique-stable-id>)` — never `fromResponse(...)` for creation
4. Optional props: `?` marker + conditional spread.
   CDK L2 `Props` interfaces (e.g. `lambda.FunctionProps`) are `readonly` — every
   field is immutable after assignment. Do NOT declare the props object first and
   mutate it inside `if (props.foo) { functionProps.vpc = ... }`: `tsc` rejects
   that with `TS2540 Cannot assign to 'X' because it is a read-only property`.
   Build each conditional block as its own object (typed `any` for the mutable
   staging variable is fine — the final spread into the typed Props preserves
   safety at construction time), then spread them into the final Props literal:
   ```ts
   const vpcConfig: any = {};
   if (props.createVpcConfig) {
     vpcConfig.vpc = vpc;
     vpcConfig.vpcSubnets = { subnets: [...] };
   }
   const functionProps: lambda.FunctionProps = {
     functionName,
     runtime,
     ...vpcConfig,   // conditional spread — not post-assignment mutation
   };
   ```
5. IAM policy scoping: specific ARN patterns, never `*`
6. One construct class per asset

### Tag PII Validation
Runtime `throw new Error(...)` checks in constructor for PII patterns.

### Authorizer Field Completeness
Generate ALL accepted authorizer configuration fields. Verify via `aws <service> <command>
--generate-cli-skeleton` — only include fields the API actually accepts. Do NOT assume field
names from documentation; some documented fields may not be accepted by the API yet.

### VPC Network Configuration
When a resource supports VPC mode, generate the VPC configuration properties that the API
accepts. Verify accepted fields via the SDK model — some services accept a network mode
selector at the top level but do NOT accept a nested configuration object for subnets and
security groups in the current API version. Check before generating.

---

## Step 5: CloudFormation YAML (`iac/compliant-resource.cfn.yaml`)

Use `awsiac` MCP for resource schema. If CFN type not registered, use custom resource.

### CFN Rules
1. **Optional parameters MUST have BOTH `Default: ""` AND a `Condition`**:
   - **CRITICAL — Parameter type for Fn::Equals**: ALL parameters referenced in `Fn::Equals`
     conditions MUST be `Type: String`, NOT `Type: CommaDelimitedList`. `Fn::Equals` requires
     two string operands — a `CommaDelimitedList` resolves to a list, causing a CloudFormation
     validation error: "every Fn::Equals object requires a list of 2 string parameters." If
     you need list behavior, accept a comma-separated `String` and use `Fn::Split` where needed.
   - **CRITICAL — Resource-level Condition must be a PLAIN STRING (cfn-lint E3001)**: The
     `Condition:` key on a CFN resource accepts ONLY a plain string — the name of a condition
     defined in the Conditions section. **NEVER** use `!Not`, `!And`, `!Or`, `!If`, `!Equals`,
     or ANY intrinsic function as the value of a resource-level `Condition:`. This is the #1
     cfn-lint failure in generated templates. Example of what NOT to do:
     ```yaml
     # WRONG — causes E3001
     MyRole:
       Type: AWS::IAM::Role
       Condition: !Not [HasRoleArn]
     ```
     Instead, define the inverse condition in the Conditions section and reference by name:
     ```yaml
     # CORRECT
     Conditions:
       HasRoleArn: !Not [!Equals [!Ref RoleArn, ""]]
       NeedsRole: !Equals [!Ref RoleArn, ""]   # inverse condition
     Resources:
       MyRole:
         Type: AWS::IAM::Role
         Condition: NeedsRole                    # plain string only
     ```
     For every resource that should only be created when a parameter is empty/absent, define
     a named inverse condition (e.g., `NeedsXyz`) alongside the positive `HasXyz` condition.
   - Define a `Condition` for each optional parameter: `HasXyz: !Not [!Equals [!Ref Xyz, ""]]`
   - Every resource property that uses the optional parameter MUST be wrapped in `!If [HasXyz, !Ref Xyz, !Ref "AWS::NoValue"]`
   - Parameters without Default+Condition will cause stack failures when empty strings are passed to APIs
   - **Common omission**: JWT fields, VPC fields, Permission Boundary ARN — check ALL optional parameters
   - **No unused conditions (cfn-lint W8001)**: Every condition defined in the `Conditions`
     section MUST be referenced by at least one resource `Condition:` key or `!If` function.
     After generating the template, scan for any condition not referenced — remove it. Common
     cause: defining `HasOrgId` or `HasVpcEndpointId` for a planned resource that ended up
     using a different gating mechanism.
   - **No unused parameters (cfn-lint W2001)**: Every parameter in the `Parameters` section
     MUST be referenced by at least one resource property, condition, or output. After generating,
     scan for unreferenced parameters and remove them. Common cause: defining parameters for
     conditions (OrgId, VpcEndpointId) that end up not being used by any resource.
   - **No redundant DependsOn (cfn-lint W3005)**: Do not add explicit `DependsOn` when the
     dependency is already established by a `!Ref`, `!GetAtt`, or `!Sub` reference. CloudFormation
     infers the dependency automatically. Common cause: adding `DependsOn: LogGroup` to a Lambda
     function that already references the log group via `!Ref LogGroup` in LoggingConfig.
2. **No Parameter/Resource name collisions (cfn-lint E3007)**: Parameter names and Resource
   logical IDs share the same namespace in CloudFormation. If a Parameter is named
   `RuntimeResourcePolicy`, you CANNOT also have a Resource with logical ID
   `RuntimeResourcePolicy` — this causes E3007 ("Resources and Parameters must not share
   name") and E3004 (circular dependency). Use distinct names: e.g., Parameter
   `RuntimeResourcePolicyDoc` vs Resource `RuntimeResourcePolicyResource`.
3. Cross-parameter validation: deployment warning comment
4. Tag validation: required tag warning in Description
5. Dependent actions: document in parameter Description
6. **Custom Resource Lambda for non-registered CFN types**: When a CFN resource type is NOT
   registered in the CloudFormation registry (checked via `awsiac` MCP), implement it as a
   `AWS::CloudFormation::CustomResource` backed by a `AWS::Lambda::Function`:
   - The Lambda handler MUST implement Create, Update, and Delete actions via SDK calls
   - Include the Lambda code inline (ZipFile) or reference an S3 key
   - The custom resource MUST send SUCCESS/FAILED to the pre-signed URL
   - Do NOT leave TODO/stub comments like "implement Lambda handler" — write the actual handler
   - The Lambda execution role needs IAM permissions for the specific API calls, including
     `TagResource` and `UntagResource` — most AWS Create* APIs that accept tags also require
     separate tag permissions. Always include these in the custom resource role policy.
   - **CRITICAL — Scope `Resource` per action group (Checkov CKV_AWS_109 / CKV_AWS_111)**:
     NEVER use `Resource: "*"` for the custom-resource role policy. Split the Statement list
     into one statement per AWS resource type and scope the `Resource` to its specific ARN
     pattern using `!Sub "arn:${AWS::Partition}:<service-arn-namespace>:${AWS::Region}:${AWS::AccountId}:<resource-type>/*"`.
     Notes:
     - Control-plane action namespaces (e.g., `<service>-control:*`) often operate on
       *data-plane* ARN namespaces (e.g., `arn:...:<service>:...`). Verify against the
       service-authorization reference before assuming the namespaces match.
     - `iam:PassRole` → scope `Resource` to `arn:${AWS::Partition}:iam::${AWS::AccountId}:role/*`
       plus `iam:PassedToService` condition.
     - `kms:*` actions → scope `Resource` to `arn:${AWS::Partition}:kms:${AWS::Region}:${AWS::AccountId}:key/*`
       (the key policy still gates access).
     - Permissions-management actions (`PutResourcePolicy`, `DeleteResourcePolicy`) → scope to
       only the resource types in the stack that accept resource-based policies (CKV_AWS_109).
     - Write actions (Create/Update/Delete on any resource type) → must be scoped to the ARN
       pattern for *that* resource type, not shared across types (CKV_AWS_111).
   - **CRITICAL — 4096-byte response limit**: CloudFormation custom resource responses are
     limited to 4096 bytes total. The `send_response` helper MUST:
     (1) Truncate `Reason` to 1000 chars max
     (2) Limit `Data` values to 200 chars each
     (3) If total response > 4000 bytes, strip `Data` to `{}` to stay under limit
     (4) Include `print()` logging of response size for CloudWatch debug visibility
     Exceeding 4096 bytes causes "Response object is too long" and stack CREATE_FAILED.
   - **CRITICAL — boto3/CLI service name**: The boto3 client name and AWS CLI command name
     for the target service MUST match the official SDK service identifier. Before generating,
     verify with `aws <service-name> help` or check `botocore.loaders.Loader().list_available_services()`.
     Common error: inserting extra hyphens or using inconsistent suffixes across files.
     The SAME correct name must be used in ALL generated files:
     CFN custom resource handler, Terraform `local-exec` provisioners, CDKTF provisioners,
     CDK `AwsCustomResource` SDK calls, SSM runbook steps, and Lambda remediators.
   - **Lambda Layer for new services**: When the target service's boto3 model is not yet
     bundled in the Lambda Python runtime, the CFN template MUST include a `Boto3LayerArn`
     parameter and attach it as a Layer to the custom resource Lambda. Make this conditional
     (`HasBoto3Layer` condition) so the template works with or without the layer.
   - **CRITICAL — SDK model validation for custom resources**: Before generating the custom
     resource Lambda handler, read the SDK model (via `awsknowledge` or `terraform` MCP) to
     verify for EACH API call:
     (a) **Request shape nesting** — the exact structure of each parameter (nested objects
         may have intermediate keys, e.g., `artifact.configuration.uri` NOT `artifact.uri`)
     (b) **Enum values** — valid enum strings for each field (e.g., `AWS_IAM` not `IAM_AUTH`,
         `CUSTOM_JWT` not `CUSTOM_JWT_AUTHORIZER`). Use create-time enum names for IaC templates.
     (c) **Name constraints** — regex patterns for names, IDs, and ARNs. Add `AllowedPattern`
         on CFN parameters to fail fast at deploy time, not at API call time.
     (d) **Parameter types** — whether a URI is S3, ECR, HTTPS, etc. Match the description.
     (e) **Dependent actions** — the custom resource Lambda role MUST include ALL actions needed
         by Create/Update/Delete calls, including: `TagResource`, `UntagResource`, sub-resource
         operations triggered by parent creation (e.g., a Create call may implicitly create
         dependent sub-resources that require separate IAM permissions), and KMS permissions (`kms:GenerateDataKey`,
         `kms:Encrypt`, `kms:Decrypt`, `kms:DescribeKey`, `kms:CreateGrant`) on any KMS keys
         passed to the resource. Missing permissions produce `AccessDeniedException` at deploy
         time — the #1 cause of custom resource deployment failures.
7. **Terraform `local-exec` and CDKTF provisioner CLI validation**: When using `null_resource`
   provisioners with `aws` CLI commands (schema-gap pattern), the CLI parameter surface differs
   from the SDK. Before generating, run `aws <service> <command> help` via MCP to verify:
   (a) **Every CLI flag exists** — some SDK parameters (e.g., `tags`) are NOT accepted as CLI
       flags. If `--tags` is rejected, use a separate `aws <service> tag-resource` call after
       creation. Never assume SDK parameters map 1:1 to CLI flags.
   (b) **Required parameters** — the CLI marks required params with `(required)` in help text.
       Include ALL required params in the provisioner command. Some parameters are conditionally
       required (e.g., a configuration object required alongside a type selector).
   (c) **JSON array construction** — when passing lists (subnets, security groups) into JSON
       structures via shell, use `jq` or proper bash array-to-JSON conversion. Do NOT embed
       comma-delimited strings directly into JSON arrays — `"subnets":"sub-1,sub-2"` is wrong,
       `"subnets":["sub-1","sub-2"]` is correct. Use:
       ```hcl
       IFS=',' read -ra ITEMS <<< "$SUBNET_IDS"
       SUBNET_JSON=$(printf '"%s",' "${ITEMS[@]}" | sed 's/,$//')
       ```
       Or use `jq -c --arg` for safe construction.
   (d) **Post-creation tagging** — if the Create API doesn't support inline tags, add a second
       provisioner step: `aws <service> tag-resource --resource-arn "$ARN" --tags "$TAGS"`.
       Check tag-resource exists for the service. If it doesn't, document the tagging gap.
   (e) **Prefer `--cli-input-json` over positional flags** — for complex parameters (tagged
       unions, nested JSON), use `--cli-input-json` with Terraform's `jsonencode()` in the
       environment block. This avoids shell quoting issues with JSON in heredocs.
   (f) **Verify CLI sub-command existence** — some SDK operations (`PutResourcePolicy`,
       `TagResource`, `UntagResource`) may not have CLI equivalents. Check the service's
       valid choices list. If a needed operation is missing, document it as a gap comment.
   (g) **IAM propagation delay** — when a provisioner creates an IAM role then immediately
       passes it to a service API, add a `time_sleep` resource (15s) between role creation
       and the provisioner. Service APIs validate role trust policies synchronously and fail
       if the role hasn't propagated. Add `hashicorp/time` provider to the module.
   (h) **Identity-based KMS permissions** — KMS key policies (resource-based) grant the service
       principal, but the service role also needs identity-based permissions for `kms:GenerateDataKey`,
       `kms:Decrypt`, `kms:DescribeKey`. Add an `aws_iam_role_policy` for KMS access.
   (i) **ECR permissions for container runtimes** — if the service runs container workloads,
       execution roles need `ecr:GetAuthorizationToken` (on `*`), `ecr:BatchGetImage`, and
       `ecr:GetDownloadUrlForLayer` (on the repository ARN). The service validates ECR access
       at create time. Only add these if `validated.json` indicates container-based execution.
   (j) **Enum values from CLI help** — the CLI help shows valid enum values for each parameter.
       Use ONLY values listed there — SDK documentation may show different or additional values.
       If only one value exists, hardcode it and document.

   (k) **CFN custom resource Lambda handlers — parameter validation**: When generating CloudFormation
       custom resource Lambda handlers that call service APIs (via boto3), only pass parameters the
       API actually accepts. Common error: passing `tags` to `create_*()` when the service doesn't
       accept tags on creation (tag-resource may be a separate API, or may not exist at all). Before
       generating the handler, cross-reference the API parameters from `validated.json`
       `api_surface.operations[]` and only include accepted parameters. If tagging is a separate API
       call, make it a separate step after creation. If tag-resource doesn't exist, document the gap.

   (l) **Cross-format enum consistency**: When the CLI only accepts specific valid enum values
       for a parameter, ALL 4 IaC formats must enforce the same set: TF variable with `validation`,
       CDK with runtime check, CDKTF variable with default, CFN with `AllowedValues`. Verify the
       valid set via `aws <service> <command> help` and use it consistently — do not default to
       values the API does not accept.

   (m) **CFN custom resource delete handler resilience**: Delete handlers in CloudFormation custom
       resource Lambdas MUST catch ALL exceptions and return SUCCESS. When a Create fails,
       CloudFormation calls Delete during rollback — but the resource was never created, so the
       delete call gets `ResourceNotFoundException` or `AccessDeniedException`. Catch both
       specifically, plus a broad `except Exception: pass` fallback. A delete handler that only
       catches `ResourceNotFoundException` will cause `ROLLBACK_FAILED` when permissions errors
       occur on never-created resources, requiring manual stack cleanup.

   (n) **API response key validation**: Different service APIs return response fields at different
       nesting levels. Before generating custom resource handlers, check the API response structure
       via `aws <service> <command> help` OUTPUT section. Common patterns:
       - Some APIs wrap the response in a named object (e.g., `{"resource": {"id": "...", "arn": "..."}}`)
       - Others return fields at the top level (e.g., `{"resourceId": "...", "resourceArn": "..."}`)
       Assuming one pattern when the API uses the other causes a KeyError. Use defensive access:
       `resp.get('<resource_key>', resp).get('id', '')` to handle both patterns.

   (o) **API field validation via `--generate-cli-skeleton`**: Before generating any API call params
       (in Lambda handlers, provisioners, or CLI commands), verify the exact accepted fields using
       `aws <service> <command> --generate-cli-skeleton` or boto3 docs. Common errors:
       - Configuration objects may accept fewer fields than documentation suggests — verify the
         exact set of accepted sub-fields via the skeleton output.
       - Nested configuration objects (e.g., `networkConfiguration`) may only accept a mode selector
         at the top level, with no sub-object for detailed config in the current API version.
       - Some Create APIs do not accept `tags` inline — tagging requires a separate
         `tag-resource` call after creation. Check the skeleton for each Create operation.

---

## Step 6: CDK for Terraform (`iac/cdktf/compliant-resource.cdktf.ts`)

**File layout requirements (REQUIRED for smoke-test validation)**:
- Source file MUST live at `iac/cdktf/compliant-resource.cdktf.ts` — NOT at `iac/compliant-resource.cdktf.ts`
- The `cdktf/` directory MUST also contain:
  - `package.json` with `cdktf` and the provider packages (e.g., `@cdktf/provider-aws`) as dependencies
  - `tsconfig.json` with `"include": ["*.ts"]` scoped to the local dir — NEVER `"../**/*.ts"`
  - `"exclude": ["node_modules"]`
- Validator runs `npm install` then `npx tsc --noEmit` inside `iac/cdktf/`.

Use `aws-documentation` MCP for CDKTF provider bindings.

### CDKTF Rules
1. Optional parameters: TerraformVariable with `default`
2. Cross-parameter validation: Terraform `check` block
3. Schema gaps: `TerraformLocal` for computed values
4. One construct class per asset (matching TF module structure)
5. **Never evaluate Terraform tokens at synth time**: `TerraformVariable.value` returns a
   token string (e.g., `${var.foo}`), NOT the runtime value. TypeScript conditionals like
   `if (myVar.value)` always evaluate to `true` because the token string is truthy. Use
   Terraform-native conditionals instead. The correct CDKTF API for equality is `Op.eq`,
   NOT `Fn.equal` (which does not exist). Import `Op` from `cdktf`:
   ```typescript
   import { Op, Fn, Token, TerraformLocal } from "cdktf";
   // WRONG — always true at synth time:
   if (vpcEndpointId.value) { ... }
   // WRONG — `Fn.equal` is not a method on `Fn`:
   Fn.conditional(Fn.equal(vpcEndpointId.stringValue, ""), ..., ...)
   // CORRECT — use `Op.eq` for equality, `Fn.conditional` for the ternary:
   new TerraformLocal(this, 'effective_vpce', Token.asString(
     Fn.conditional(Op.eq(Fn.lengthOf(vpcEndpointId.stringValue), 0), "", vpcEndpointId.stringValue)
   ));
   ```
   Alternatively, use resource `count` with `Fn.lengthOf` to gate resources on optional
   variables. This applies to ALL optional TerraformVariables.
5. **Null-resource provisioners**: When using a null resource for schema gaps, the
   `@cdktf/provider-null` package exports the class as `Resource` (NOT `NullResource`) from
   `@cdktf/provider-null/lib/resource`. Import it with an alias for readability:
   ```typescript
   import { Resource as NullResource } from "@cdktf/provider-null/lib/resource";
   import { NullProvider } from "@cdktf/provider-null/lib/provider";
   ```
   Include the actual `local-exec` provisioner with the AWS CLI command — not just triggers.
   The null resource supports `addOverride('provisioner', [...])` for provisioner configuration.
   A null resource with only triggers and no provisioners is a no-op.
   ```typescript
   const schemaGap = new NullResource(this, 'schema-gap', { triggers: { ... } });
   schemaGap.addOverride('provisioner', [{
     'local-exec': { command: 'aws <service> update-<resource> ...' }
   }]);
   ```

---

## Step 7: Known Coverage Gaps

For every entry in `mapping-results.json` `coverage_gaps[]`:
Add a `KNOWN GAP` comment block in ALL 4 templates:
```
# KNOWN GAP: <type> — <id>
# Description: <description>
# Recommendation: <recommendation>
```

---

## Step 8: Cross-Parameter Validation

When multiple parameters are related:
- **TF**: `lifecycle { precondition }` on the resource block
- **CDK**: runtime `if` check + `throw new Error(...)` in constructor
- **CFN**: deployment warning comment
- **CDKTF**: `check` block

---

## Post-Generation Steps

### 1. Generate lock files

After writing CDK and CDKTF package.json files, run `npm install` in each directory to
generate `package-lock.json`. The stop hook uses `npm ci` which requires a lock file.

```bash
cd .service-approval/<slug>/05-generate/iac/cdk && npm install --silent && cd -
cd .service-approval/<slug>/05-generate/iac/cdktf && npm install --silent && cd -
```

### 2. Generate smoke-test parameter files

The deploy test script (`scripts/smoke-deploy-test.sh`) is service-agnostic. It expects
parameter files that provide minimal values for a standalone deploy+teardown cycle. The
generate-iac skill MUST produce these alongside the templates.

**Terraform: `iac/terraform/smoke-test.tfvars`**

Provide values for ALL required variables. **CRITICAL**: Use the literal string `${ACCOUNT_ID}`
(not a dummy like `123456789012`) for any ARN that references the deploying account — the
deploy script substitutes it at runtime with `sed`. Rules:
- Security features that need external prereqs (VPC, Signer profiles) MUST be optional
  in the template (use `create_*` bool variables defaulting to `true`, but set to `false`
  in the smoke-test.tfvars). This lets production use enforce them while smoke tests skip them.
- Provide a dummy source directory or inline code (Lambda: `src/index.py` with a hello handler)
- Use the account root ARN for KMS key administrators: `arn:aws:iam::${ACCOUNT_ID}:root`

Example pattern:
```hcl
# Auto-generated smoke test values — deploy-and-teardown validation
# ${ACCOUNT_ID} is replaced at runtime by smoke-deploy-test.sh
function_name       = "smoke-test-validation"
environment         = "smoke-test"
owner               = "smoke-test-pipeline"
cost_center         = "smoke-test"
create_vpc_config   = false    # Skip VPC — no prereqs needed
create_code_signing = false    # Skip Signer — no prereqs needed
kms_key_administrators = ["arn:aws:iam::${ACCOUNT_ID}:root"]
```

**CloudFormation: `iac/cloudformation/smoke-test-params.json`**

Standard CFN parameter override format. Same rules — skip prereqs, use placeholders.

```json
[
  {"ParameterKey": "FunctionName", "ParameterValue": "smoke-test-validation"},
  {"ParameterKey": "Environment", "ParameterValue": "smoke-test"},
  {"ParameterKey": "KmsKeyAdminArn", "ParameterValue": "arn:aws:iam::${ACCOUNT_ID}:root"},
  {"ParameterKey": "CreateVpcConfig", "ParameterValue": "false"},
  {"ParameterKey": "CreateCodeSigning", "ParameterValue": "false"}
]
```

**CRITICAL — every `Default:` AND every smoke-test `ParameterValue` MUST satisfy its parameter's `AllowedPattern`**:
Neither CloudFormation nor `cfn-lint` validates a parameter's `Default:` value against its
own `AllowedPattern` at synth time — the mismatch surfaces only at `CreateStack` as a
`ValidationError: Parameter 'X' must match pattern ...` and blocks the entire deploy. The
same applies to values written into `smoke-test-params.json`. Both values must be verified
by the generator before the template is written.

Required workflow:

1. For every CFN Name-like parameter you add an `AllowedPattern` to, extract the authoritative
   pattern from the service's boto3 shape metadata in
   `.service-approval/<slug>/03-validate/validated.json` / `research.json`
   (`api_surface.operations[].parameters[].pattern`), NOT from a guessed regex.
2. Cross-check the `Default:` literal string against the pattern. If the pattern forbids
   hyphens (e.g., `[a-zA-Z][a-zA-Z0-9_]*`), the Default must use underscores or camelCase.
   If it forbids underscores (e.g., `[a-zA-Z0-9][a-zA-Z0-9-]*`), use hyphens. Never hand-write
   a Default that mirrors a common naming convention without running it through the regex.
3. Cross-check every `ParameterValue` in `smoke-test-params.json` against the same pattern.
4. When multiple resources in the same template have different patterns, name each smoke-test
   value per-pattern — do NOT reuse one string like `"smoke-test-foo"` across parameters with
   different character classes.

Generic example (placeholders — substitute the actual service and resource type names at
generation time):

```yaml
# CFN parameter block — Default and AllowedPattern must be mutually consistent
<ResourceType>Name:
  Type: String
  Default: smoke_test_<resource_type>   # underscores — matches pattern below
  AllowedPattern: "[a-zA-Z][a-zA-Z0-9_]*"
```
```json
// smoke-test-params.json — ParameterValue must also match
{"ParameterKey": "<ResourceType>Name", "ParameterValue": "smoke_test_<resource_type>"}
```

Services vary widely in what their Name regexes permit:

| Service / resource | Pattern permits | Pattern forbids |
|-------------------|-----------------|-----------------|
| Lambda function name | `[a-zA-Z0-9-_]+` | `.` |
| S3 bucket name | `[a-z0-9.-]{3,63}` | uppercase, underscores |
| DynamoDB table name | `[a-zA-Z0-9_.-]+` | spaces |
| IAM role name | `[\w+=,.@-]+` | whitespace |
| Many managed-service resource names | `[a-zA-Z][a-zA-Z0-9_]*` | hyphens, leading digits |

The rule is identical across services; only the character class differs. Always consult the
boto3 shape `pattern` attribute for the service you are generating — do not copy a pattern
from a sibling service.

### 3. Make security features toggleable

For the Terraform module and CFN template, security features that require external
resources MUST be controlled by boolean variables/parameters:

| Feature | TF variable | CFN parameter | Default | Smoke test |
|---------|-------------|---------------|---------|------------|
| VPC attachment | `create_vpc_config` | `CreateVpcConfig` | `true` | `false` |
| Code signing | `create_code_signing` | `CreateCodeSigning` | `true` | `false` |
| Function URL | `create_function_url` | `CreateFunctionUrl` | `false` | `false` |

When the toggle is `false`, the template must NOT create the dependent resources
(security group, code signing config, function URL) or reference them in the main
resource. Use `count`/`dynamic` blocks in Terraform and `Conditions` in CFN.

Features that work standalone (KMS keys, log groups, DLQ, X-Ray, tags, execution role)
should ALWAYS be created — they have no external prereqs.

**Primary resource toggle**: For services where the main resource requires external
artifacts (e.g., code artifacts for serverless runtimes, container images for ECS),
add a `create_primary_resource` toggle (default true, smoke-test false). When false,
the template deploys only the supporting infrastructure (KMS, IAM, log group, VPC).
This validates the security posture resources without needing a real artifact.

| Feature | TF variable | CFN parameter | Default | Smoke test |
|---------|-------------|---------------|---------|------------|
| Primary resource | `create_primary_resource` | `CreatePrimaryResource` | `true` | `false` |

## Validate Generated Artifacts

IaC validation runs automatically via Stop hook (validate_cross.py Checks X6, X7). Run `terraform validate` manually if terraform CLI is available.

## Print Summary

```
Generate (IaC) complete:
  Terraform:          iac/terraform/main.tf + {N} modules
  CDK TypeScript:     iac/cdk/compliant-resource.cdk.ts (+ package.json, tsconfig.json)
  CloudFormation:     iac/cloudformation/compliant-resource.cfn.yaml
  CDK for Terraform:  iac/cdktf/compliant-resource.cdktf.ts (+ package.json, tsconfig.json)
  Parameter coverage: {N}/{N} parameters across all templates
  Known gaps:         {N} documented
  Output: .service-approval/<slug>/05-generate/iac/
```
