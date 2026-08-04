---
name: assess
description: Run a 5-domain CAF security posture assessment for an AWS service. Produces (1) assessment-summary.md — CAF-structured findings with GAPS tables, (2) sar-facts.json — extracted SAR data, (3) checkpoint-results.json — factual checkpoint verification. These feed into the research, validate, and generate phases.
disable-model-invocation: false
argument-hint: '[./input-folder] [--service=<name>] [--questions=<file>]'
---

# Service Approval — Assessor

Perform a comprehensive security posture assessment for an AWS service across the 5 AWS Cloud
Adoption Framework (CAF) Security Perspective domains. Produces structured output that feeds
into the Researcher, Validator, and Generator agents.

This skill bridges the gap between "What does this service support?" (assessment) and
"What controls should we apply?" (controls generation). GAPS identified here become
controls requirements. SAR facts become condition key verification data. Checkpoint
results become SCP/RCP feasibility inputs.

---

## Outputs

| File | Purpose | Consumed By |
|------|---------|-------------|
| `.service-approval/<slug>/01-assess/assessment-summary.md` | CAF-structured findings with GAPS tables per domain | Researcher (gap-driven controls), Summarizer |
| `.service-approval/<slug>/01-assess/sar-facts.json` | Extracted SAR data (actions, condition keys, resource types, permission-only actions) | Validator (condition key verification), Researcher (IAM controls) |
| `.service-approval/<slug>/01-assess/checkpoint-results.json` | Factual checkpoint verification results (RCP, declarative policies, FIPS, RAM, etc.) | Validator (SCP/RCP expressibility), Generator (skip inapplicable controls) |
| `.service-approval/<slug>/01-assess/assessment-questionnaire.md` | SITCO Bar questionnaire answers (if --questions provided) | Summarizer (evidence) |
| `.service-approval/<slug>/01-assess/domains/{DOMAIN}-research.md` | Intermediate domain research files | Researcher (reuse findings) |

---

## Inputs

Parse arguments:
- `./input-folder` (optional) — read .md, .json, .xlsx, .pdf, .docx files for context
- `--service=<name>` — AWS service name (e.g., "Amazon Bedrock AgentCore", "AWS Lambda", "Amazon S3")
- `--questions=<file>` — Path to SITCO Bar Questions file (.docx or .txt). If provided, also produce questionnaire answers.

If no `--service` and no input folder, ask the user for a service name.

---

## Prerequisites

Per-service slug and phase directories are created after slug derivation in Step 0b.
No hardcoded prerequisites — paths are derived dynamically.

---

## MCP call logging

**Required: emit canonical `mcp:<server>:call` events to `pipeline.log` after EVERY MCP tool invocation.** The Stop hook's P1 check (`tools/validate/validate_pipeline_integrity.py` — see `_MCP_CALL_TOKEN_RE`) anchors on the `[mcp:<server>:call]` token. The `_hook_log` auto-mirror copies canonical events into `mcp-calls.log` for free.

After each MCP call, run:

```bash
python3 -m tools.validate.log \
    --slug <slug> \
    --phase 01-assess \
    --source mcp:<server> \
    --verdict call \
    --message "<tool-name>: <one-line description>"
```

Substitute `<server>` with the MCP server name (`awsknowledge`, `aws-documentation`, `kb-search`, etc.).

---

## Step 0: SAR Pre-Read

The Service Authorization Reference page is the definitive source for IAM actions, resource types, and condition keys.

1. Look up the SAR slug from `input/sar-slugs.json` (regenerate with `python3 scripts/regenerate-sar-slugs.py` if the service is missing).
2. Read the SAR page: `https://docs.aws.amazon.com/service-authorization/latest/reference/list_{slug}.html`
3. **SAR pages are large** — if truncated (contains `start_index=N`), keep reading with increasing start_index. Safety cap: 50 reads.
4. Extract these 4 categories:
   - **permission_only_actions** — Actions marked "[permission only]" with no API call
   - **condition_keys** — Service-specific keys (format: `prefix:keyname`), excluding `aws:*` globals.
     Emit as an array of OBJECTS `{"key": "prefix:keyname", "type": "String", "applies_to_actions": ["CreateX", "UpdateX"]}`,
     NOT as bare strings. Populate `applies_to_actions` from the SAR page's "Condition keys" column
     joined to the Actions table — this is what downstream phases use for semantic SAR matching
     (`compute_gateable_by.py`) and for `capabilities.iam.condition_keys[]` in research-capabilities.
     Without `applies_to_actions`, validator CHECK-S7 fails in Phase 1 and every cold-start run has
     to back-fill the field.

     **Type field (REQUIRED).** Every condition_keys entry MUST include a `type` field
     extracted verbatim from the SAR page's Condition Keys table "Type" column. Valid values
     include: `String`, `Bool`, `Date`, `Numeric`, `ARN`, `IPAddress`, `ArrayOfString`,
     `ArrayOfARN` (and a few others — copy verbatim from the SAR row, don't normalize or
     abbreviate). The `type` enables downstream `generate-preventive` to detect multi-value
     keys (`ArrayOf*`) that require `ForAnyValue:`/`ForAllValues:` qualifiers in IAM
     conditions — without qualifier, IAM AccessAnalyzer rejects the policy at deploy time
     with "The request context key X has multiple values." The schema at
     `schemas/sar-facts.schema.json` already permits `type` (optional field on conditionKey
     $defs) — this extraction is the upstream half of that contract.

     **Placeholder form.** The SAR Actions table renders object-tag placeholders as `<key>`
     literals (e.g., `s3:ExistingObjectTag/<key>`, `s3:RequestObjectTag/<key>`). Normalize
     to `${key}` form during extraction because the `sar-facts.schema.json` condition-key
     pattern rejects `<`/`>` characters but accepts `${}`, and downstream Phase 1 consumers
     expect the `${}` placeholder form. Deterministic substitution: replace `/<([^>]+)>`
     with `/${\1}` in key names before emission.

     **Resource-tag empty-binding fallback.** Some SAR pages define tag-based condition keys
     (e.g., `<service>:BucketTag/${TagKey}`, `<service>:ResourceTag/${TagKey}`) in the
     Condition Keys section but do NOT bind them in the Actions table's Condition-keys
     column. This would leave `applies_to_actions: []`, which the schema rejects. When the
     key name matches `^<service>:.*Tag/\$\{?TagKey\}?$` (resource-tag key) AND the Actions
     table binding is absent, derive applies_to_actions by listing every action whose name
     contains the resource-type fragment from the key (e.g., `BucketTag` → actions with
     "Bucket" in the name). Record `source: "sar_tag_keys_fallback"` on the derived entry so
     downstream validators can distinguish derived bindings from SAR-verbatim ones. Do NOT
     use this fallback for non-tag keys — it only holds for resource-tag conditions where
     the SAR's omission is a documentation limitation, not an actual constraint. This mirrors
     the rule in `research-capabilities/SKILL.md` for consistency across Phase 0 / Phase 1.
   - **resource_types** — Resource type names and ARN patterns
   - **wildcard_only_actions** — Actions that can ONLY use `"Resource": "*"` in IAM policies.
     Extraction rule: An action is wildcard-only if and only if its "Resource types" column
     in the SAR Actions table is EMPTY — no resource types listed at all. Check EACH action
     row individually. Common categories of wildcard-only actions:
     - Create* actions for new top-level resources (resource doesn't exist yet, so no ARN)
     - List* actions with an empty Resource types column (list all resources of a type)
     - Permission-only actions with an empty Resource types column
     CRITICAL: An action is NOT wildcard-only if it has ANY resource types listed in the SAR
     table, even if those types are marked optional or not-required. Many List* actions that
     list sub-resources of a parent (e.g., listing targets of a specific parent resource) DO
     have resource types and support resource-level scoping — do NOT mark these as wildcard.
     Similarly, ListTagsForResource typically has resource types listed and is NOT wildcard-only.
     False positives here cause overly permissive `Resource: "*"` in generated IAM policies.
     Missing entries cause the IaC generator to attempt invalid resource ARN scoping.
5. Also extract: total action count, SLR details, dependent actions.

**DO NOT write sar-facts.json yet** — Step 0b (below) derives the canonical slug first.
```json
{
  "service": "{service-name}",
  "sar_url": "https://docs.aws.amazon.com/...",
  "total_actions": 42,
  "permission_only_actions": ["action1", "action2"],
  "condition_keys": [
    {"key": "prefix:key1", "applies_to_actions": ["CreateX", "UpdateX"]},
    {"key": "prefix:key2", "applies_to_actions": ["DeleteX"]}
  ],
  "resource_types": [
    {"name": "resource", "arn_pattern": "arn:aws:service:*:*:resource/*"}
  ],
  "wildcard_only_actions": ["action3"],
  "service_linked_roles": [
    {"role_name": "AWSServiceRoleFor*", "service_principal": "*.amazonaws.com", "permissions": ["action1"]}
  ],
  "cfn_prefix": "{CfnPrefix}",
  "service_prefix": "{iam-prefix}"
}
```

---

## Step 0b: Derive Canonical Slug and Promote Staging

**NEW:** After SAR facts are extracted (Step 0), derive the canonical service slug and atomically promote the intake staging directory to the per-service tree.

1. **Read intake manifest** from staging:

   ```python
   import json
   from pathlib import Path
   
   # Find the latest staging directory
   staging_base = Path(".service-approval/_staging")
   if staging_base.exists():
       staging_dirs = sorted(staging_base.iterdir(), key=lambda p: p.name, reverse=True)
       if staging_dirs:
           latest_staging = staging_dirs[0]
           manifest_path = latest_staging / "00-intake" / "intake-manifest.json"
           with open(manifest_path) as f:
               intake_manifest = json.load(f)
   ```

2. **Derive canonical slug** using `tools/slug.py`:

   ```python
   from tools.slug import derive_canonical_slug
   
   # From Step 0 SAR extraction
   service_name = sar_facts["service"]          # e.g., "AWS Lambda"
   service_prefix = sar_facts["service_prefix"] # e.g., "lambda"
   user_candidate = intake_manifest["service"].get("candidate_slug", service_prefix)
   
   slug = derive_canonical_slug(service_name, service_prefix, user_candidate)
   # Result: "awslambda" for Lambda, "bedrock-agentcore" for AgentCore, "s3" for S3
   ```

3. **Create service root and promote staging**:

   ```bash
   # Using tools/paths.py
   from tools.paths import service_root, phase_dir
   
   service_dir = service_root(slug)  # .service-approval/<slug>/
   assess_dir = phase_dir(slug, "assess")  # .service-approval/<slug>/01-assess/
   
   # Create directory structure
   assess_dir.mkdir(parents=True, exist_ok=True)
   (assess_dir / "domains").mkdir(exist_ok=True)
   
   # Atomic promotion: move staging intake to canonical location
   import shutil
   staging_intake = latest_staging / "00-intake"
   target_intake = service_dir / "00-intake"
   if target_intake.exists():
       shutil.rmtree(target_intake)  # Clean mode or re-run
   shutil.move(str(staging_intake), str(target_intake))
   
   # Optionally remove staging parent if empty
   if not any(latest_staging.iterdir()):
       latest_staging.rmdir()
   ```

4. **Write sar-facts.json** to the canonical path:

   Write to `.service-approval/<slug>/01-assess/sar-facts.json` using the JSON structure from Step 0.

5. **Record slug in intake manifest** (update in place):

   ```python
   intake_manifest["service"]["canonical_slug"] = slug
   intake_path = service_dir / "00-intake" / "intake-manifest.json"
   with open(intake_path, "w") as f:
       json.dump(intake_manifest, f, indent=2)
   ```

**All downstream steps** (checkpoints, domain research, assessment summary) write to `.service-approval/<slug>/01-assess/` per the per-slug layout.

---

## Step 1: Parallel Domain Research

For EACH of the 5 CAF Security Perspective domains, use subagents for parallel research.

Each domain has mandatory reads, mandatory searches, and KB queries defined in CLAUDE.md.
Substitute `{service}` with the actual service name, `{service_slug}` with the GR page slug,
and `{cfn_prefix}` with the CloudFormation prefix from SAR facts.

```
Spawn 5 agents in parallel:
  Agent("IAM research for {service}")
  Agent("LOGGING research for {service}")
  Agent("INFRA research for {service}")
  Agent("DATA research for {service}")
  Agent("INCIDENT research for {service}")
```

Each research agent MUST:
1. Execute ALL mandatory reads for its domain (from CLAUDE.md)
2. Execute ALL mandatory searches (substituting `{service}`)
3. Query relevant Knowledge Bases using `mcp__kb-search__search_*` tools
4. Include the SAR facts for IAM/LOGGING/DATA domains
5. Write findings to `.service-approval/<slug>/01-assess/domains/{DOMAIN}-research.md`
6. Include source URLs for every finding

CRITICAL RESEARCH RULES:
- Do NOT search the same URL or query twice
- Limit to ~40 MCP tool calls per domain
- TOOL FAILURE GUARD: If a tool call returns an error, treat the data as ABSENT

### Assessment Depth Requirements

Each domain research agent MUST produce these depth markers to achieve parity with
the hosted solution (~140K char output vs the current ~29K):

**IAM domain depth:**
- Enumerate ALL permission-only actions (from SAR page `[permission only]` annotations)
- Build condition key → applicable actions reverse index (which actions each CK applies to)
- List ABAC support per resource type (not just "partial" — name each type + support level)
- List ALL AWS managed policies with their purpose

**LOGGING domain depth:**
- Enumerate ALL CloudWatch metric names per namespace (not just "30+ metrics")
- Document CloudTrail data event pagination (keep reading if truncated)
- List ALL AWS Config resource types with their relationship details

**INFRA domain depth:**
- Enumerate ALL CloudFormation resource types from the CFN template reference
- List ALL service quotas with numerical values + default vs adjustable
- Document Console Private Access support

**DATA domain depth:**
- Per-resource encryption breakdown (not "supports KMS" — specify which resources + which key types)
- FIPS endpoint URLs (actual URLs, not just "supported")
- Compliance program list with in-scope/not-in-scope distinction

### Research Quality Enforcement

These rules ensure research completeness and prevent wasted tool calls:

1. **Deduplication**: Never read the same URL or search the same query twice within a single
   domain. Before each MCP call, check if the URL or query has already been used. If a URL
   was read in a prior domain and the data is still in context, reuse it instead of re-reading.

2. **Tool call safety cap**: Maximum 50 MCP tool calls per domain (hard cap). If a domain
   approaches 50 calls, prioritize mandatory reads/searches over exploratory queries. Stop
   exploratory research at 40 calls and reserve remaining budget for mandatory items.

3. **Mandatory coverage enforcement**: Before concluding research for ANY domain, verify
   that ALL mandatory reads and ALL mandatory searches from CLAUDE.md for that domain have
   been completed. If any mandatory item is missing, execute it before moving to synthesis.
   A domain with incomplete mandatory coverage is a research failure — do not proceed to
   synthesis until all mandatory items are attempted.

### Output Quality Self-Check

Before finalizing any output (assessment-summary.md or assessment-questionnaire.md), run
these checks. Fix any issues found before writing the file.

1. **Terminology leak scan**: Check every line against the terminology replacement table
   in CLAUDE.md. If any leaked term is found (e.g., `gateway_aws-documentation-mcp___`,
   `mcp__aws-documentation__`, `pre-researched findings`, `TOOL FAILURE GUARD`), replace
   it with the corresponding user-facing term. This is a hard gate — do not write output
   containing any leaked term.

2. **Meta-commentary removal**: Scan for and remove any lines containing: "As a synthesizer",
   "Direction should be", "Note to reviewer", "Editorial note:", "Internal note:", "Tool
   unavailable", "MCP session error", or similar pipeline self-references.

3. **SAR count verification**: If sar-facts.json was produced, verify that IAM domain
   findings reference at least the same number of condition keys and resource types as
   extracted from the SAR page. If the assessment mentions fewer items than sar-facts.json
   contains, the synthesis is incomplete — add the missing items.

4. **Answer direction normalization** (questionnaire mode): Every `[A#]` answer MUST start
   with exactly one of: `Yes` / `No` / `Not found` / `Yes, partially` / `This is`. Apply
   the direction normalization table from CLAUDE.md. Common fixes:
   - "No, partially" or "No with a nuance" -> "No."
   - "Partially" or "Partial." -> "Yes, partially."
   - Stuttered directions ("partially, partially" or "partially. partially") -> single "Yes, partially."

### Verification Quality

When running Step 6 (Cross-Domain Consistency Check) or any verification pass:

1. **Correction specificity**: Every correction MUST include: (a) the specific answer number
   or section being corrected, (b) what is currently wrong, and (c) what the correct value
   should be with the authoritative source.

2. **No contradictory corrections**: Never propose two corrections for the same answer that
   contradict each other. If two sources disagree, use the more authoritative source
   (checkpoint pages > SAR page > documentation pages > KB results) and discard the other.

3. **Source evidence requirement**: If corrections conflict, keep only the correction backed
   by the most authoritative source. Checkpoint results are the highest authority, followed
   by SAR page data, then primary documentation, then KB results.

---

## Step 2: Factual Checkpoint Verification

Read the 9 factual checkpoint pages and record results. These are authoritative — they
override any findings from Step 1 if they contradict.

| Domain | Checkpoint | URL | Question | Definitive? |
|--------|-----------|-----|----------|-------------|
| LOGGING | VPCE network events | https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-network-events-with-cloudtrail.html#logging-network-events | Is `{service}.amazonaws.com` listed as eventSource? | No |
| LOGGING | CloudTrail data events | https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-cloudtrail.html | Are there `AWS::{CfnPrefix}::` data event types? | No |
| LOGGING | AWS Config types | https://docs.aws.amazon.com/config/latest/developerguide/resource-config-reference.html | Are there `AWS::{CfnPrefix}::` Config types? | No |
| INFRA | RCP support | https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_rcps.html | Is the service listed? | **Yes** |
| INFRA | Declarative policies | https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_declarative.html | Is the service listed? | **Yes** |
| INFRA | RAM shareable | https://docs.aws.amazon.com/ram/latest/userguide/shareable.html | Has shareable resource types? | **Yes** |
| DATA | FIPS endpoints | https://aws.amazon.com/compliance/fips/ | Is the service listed? | **Yes** |
| DATA | Compliance in scope | https://aws.amazon.com/compliance/services-in-scope/ | Which programs? | No |
| INFRA | SCP support | https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html | Is the service excluded? | No |

**Definitive checkpoints** (marked **Yes**): These are exhaustive lists. If the service
is NOT listed, the answer is definitively "No" / "Not supported."

Write to `.service-approval/<slug>/01-assess/checkpoint-results.json`:
```json
{
  "service": "{service-name}",
  "checkpoints": {
    "vpce_network_events": {"supported": true, "detail": "listed as eventSource", "url": "..."},
    "cloudtrail_data_events": {"supported": true, "resource_types": ["AWS::S3::Object"], "url": "..."},
    "config_resource_types": {"supported": true, "resource_types": ["AWS::S3::Bucket"], "url": "..."},
    "rcp_support": {"supported": false, "definitive": true, "detail": "not in RCP list", "url": "..."},
    "declarative_policies": {"supported": false, "definitive": true, "detail": "not listed", "url": "..."},
    "ram_shareable": {"supported": false, "definitive": true, "detail": "no shareable types", "url": "..."},
    "fips_endpoints": {"supported": true, "definitive": true, "detail": "listed with FIPS URLs", "url": "..."},
    "compliance_in_scope": {"supported": true, "programs": ["SOC 1", "SOC 2", "HIPAA", "PCI DSS", "ISO 27001"], "not_in_scope": ["FedRAMP High"], "detail": "service-specific notes", "url": "..."},
    "scp_support": {"supported": true, "detail": "not excluded from SCP enforcement", "url": "..."}
  }
}
```

---

## Step 2b: IaC Provider Discovery

After checkpoint verification, discover which IaC providers support this service. This
determines what output formats Phase 4 (Generate) will produce. The user does NOT choose
formats — the pipeline discovers what's available and informs them.

### Check 1: CloudFormation Support

Use `aws-documentation` MCP to read the CloudFormation Template Reference page:
```
URL: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/AWS_{CfnPrefix}.html
```

Record:
- Number of `AWS::{CfnPrefix}::*` resource types
- List of resource type names
- If the page doesn't exist or returns 404 → CloudFormation NOT supported

### Check 2: Terraform Provider Support

Search for Terraform resources:
```
Search: "aws_{service_prefix}" OR "awscc_{cfn_prefix}" terraform provider
```

Determine:
- Does `hashicorp/aws` have native resources (`aws_{prefix}_*`)?
- Does `hashicorp/awscc` (Cloud Control) have resources (`awscc_{prefix}_*`)?
- If CloudFormation is supported, awscc is always available as a fallback

### Check 3: CDK Construct Support

Search for CDK module:
```
Search: aws-cdk-lib aws_{service_prefix} OR aws-cdk-lib/aws-{service}
```

Determine:
- L2 constructs available? (high-level, opinionated)
- L1 only? (CfnResource — direct CloudFormation mapping)
- Alpha module? (`@aws-cdk/aws-{service}-alpha`)
- If CloudFormation is supported, L1 constructs always exist

### Check 4: CDKTF Support

CDKTF derives from Terraform providers:
- If `hashicorp/aws` has resources → CDKTF supported via aws provider
- If only `hashicorp/awscc` → CDKTF supported via awscc provider
- If neither → CDKTF NOT supported

### Present Findings to User

After discovery, present the results clearly:

```
┌─────────────────────────────────────────────────────────────────┐
│  IaC Provider Support: {service_friendly_name}                  │
├─────────────────────────────────────────────────────────────────┤
│  CloudFormation  ✓ {N} resource types (AWS::{Prefix}::*)        │
│  Terraform       ✓ awscc provider / ✓ native aws / ✗ None      │
│  CDK TypeScript  ✓ L2 constructs / △ L1 only / ✗ None          │
│  CDKTF           ✓ via {provider} / ✗ Not available             │
├─────────────────────────────────────────────────────────────────┤
│  Formats that will be generated:                                │
│    {list of supported formats}                                  │
│                                                                 │
│  Formats NOT available:                                         │
│    {list with reason}                                           │
├─────────────────────────────────────────────────────────────────┤
│  Override: enter formats to skip, or press Enter to accept all  │
└─────────────────────────────────────────────────────────────────┘
```

If the user wants to skip a supported format (e.g., "skip CDKTF"), record that override.
If a format is NOT supported, it cannot be forced — the generator has no resources to work with.

### Write Results

Write to `.service-approval/<slug>/01-assess/iac-support.json`:

```json
{
  "schema_version": "1.0.0",
  "service": "{service-name}",
  "discovered_at": "{ISO-8601 timestamp}",
  "cloudformation": {
    "supported": true,
    "resource_type_count": 15,
    "resource_types": ["AWS::Service::Resource1", "..."],
    "template_reference_url": "https://docs.aws.amazon.com/...",
    "notes": ""
  },
  "terraform": {
    "supported": true,
    "provider": "awscc|aws|both",
    "native_resource_count": 0,
    "cloud_control_available": true,
    "notes": ""
  },
  "cdk": {
    "supported": true,
    "construct_level": "L1|L2|L2-alpha",
    "module_name": "aws-cdk-lib/aws-{service}",
    "notes": ""
  },
  "cdktf": {
    "supported": true,
    "derives_from": "aws|awscc",
    "notes": ""
  },
  "generate_formats": {
    "cloudformation": true,
    "terraform": true,
    "cdk_typescript": true,
    "cdktf": true
  },
  "user_overrides": [],
  "warnings": []
}
```

Phase 4 (Generate) reads `state/iac-support.json` to determine which formats to produce.
If the file is missing (e.g., assess was skipped), Generate defaults to CloudFormation only.

---

## Step 3: Synthesize CAF Assessment

After all research completes, read the domain research files from `.service-approval/<slug>/01-assess/domains/`.

For EACH domain, produce a CAF section using this format:

```markdown
## [DOMAIN] {Domain Label}

### {N}. {Topic}
{Detailed findings with inline source citations}

**Sources**: [source URLs]

### [DOMAIN_GAPS] Compliance Matrix

| # | Requirement | Status | Details |
|---|-------------|--------|---------|
| 1 | {requirement} | FULLY SUPPORTED | {details} |
| 2 | {requirement} | REQUIREMENT GAP | {details} |
| 3 | {requirement} | CUSTOMER ACTION REQUIRED | {details} |
```

Status values (EXACTLY these strings):
- `FULLY SUPPORTED` — AWS provides this natively
- `PARTIALLY SUPPORTED` — Available with configuration or limitations
- `REQUIREMENT GAP` — Not available in the service
- `CUSTOMER ACTION REQUIRED` — Available but requires customer setup

Apply SAR facts as a minimum floor for IAM/LOGGING/DATA domains.
Apply checkpoint results — override any synthesis that contradicts a checkpoint.

Follow ALL precision rules and synthesis rules from CLAUDE.md for each domain.
Follow ALL terminology rules — never leak internal tool names.

### Domain-Specific Synthesis Addendums

These rules supplement the CLAUDE.md domain synthesis rules with additional precision
requirements derived from common accuracy failures:

**IAM domain synthesis**:
- ABAC support level: Explicitly state "full", "partial", or "none". Full = service supports
  all 4 tag condition keys (RequestTag, ResourceTag, TagKeys, aws:TagKeys). Partial = some
  but not all. None = no tag-based condition keys.
- SLR enumeration: Every service-linked role MUST include the full permission list (all IAM
  actions the SLR is allowed to perform). A role name without permissions is incomplete.
- Permission-only actions: List ALL from the SAR page. These are actions with "[permission only]"
  annotation — they have no API call and no CloudTrail event. Do not confuse with "actions not
  evaluated by IAM" (which is the opposite).
- Declarative policies distinction: "Declarative policies" refers ONLY to the AWS Organizations
  policy type (ec2/vpc-related controls). Do not conflate with Cedar policies, resource-based
  policies, or any other policy mechanism.

**LOGGING domain synthesis**:
- VPCE network events: These are CloudTrail NetworkActivity events (eventCategory=NetworkActivity),
  a separate category from management/data events. Do not merge with general CloudTrail support.
- Data events: ONLY use the CloudTrail data events authoritative page as the source. Do not
  rely on service-specific documentation pages for data event resource types.
- CloudWatch namespace consistency: AWS vended metrics use `AWS/{ServiceName}`. If the service
  uses a different prefix or has subsystem-specific namespaces, list each one explicitly.
  `AWS/Usage` is a legitimate cross-service namespace, not an error.

**INFRA domain synthesis**:
- RCPs != resource-based policies. RCPs are an AWS Organizations policy type. Resource-based
  policies are JSON policies attached to individual resources. Never conflate the two.
- Declarative policies for INFRA = VPC block public access, EBS encryption defaults, and similar
  account-level declarative settings. Not SCPs, not IAM policies.
- Quota verification: Every numerical quota claimed MUST have a documentation URL. Do not
  estimate or infer quotas.

**DATA domain synthesis**:
- FIPS endpoints: These are specific service URLs (e.g., `fips.us-east-1.service.amazonaws.com`),
  NOT references to FIPS 140-3 validated crypto modules. The FIPS endpoints page is the
  authoritative source.
- Cross-region replication: Means data is physically copied to another region. Inference routing
  (sending requests to models in other regions) is NOT replication.
- Per-resource encryption tiers: Each resource type may support different encryption options
  (AWS-owned, AWS-managed, CMK). Do NOT merge them into a single statement like "supports KMS".
  Break down by resource type.

**INCIDENT domain synthesis**:
- Only cite capabilities specific to this service. GuardDuty, Detective, and Security Hub are
  generic AWS capabilities — do not list them unless the service has a specific integration.
- "Supports tagging" (has TagResource API) is NOT the same as TBAC (tag-based access control)
  or ABAC. Tagging for incident tracking is about operational tagging, not IAM authorization.

### Domain-Specific Validation Addendums

These checks run during Step 6 (Cross-Domain Consistency Check) and supplement the general
consistency check with domain-specific accuracy verification:

**IAM validation**:
- Verify condition key count: The number of condition keys mentioned in the IAM section must
  be >= the count in sar-facts.json. If fewer, the synthesis missed keys.
- Verify SLR completeness: Every SLR in sar-facts.json must appear in the IAM section with
  its full permission list. Missing SLRs or partial permission lists are validation failures.
- Verify ABAC level: If the service has all 4 tag condition keys in SAR, ABAC must be "full".
  If fewer, it must be "partial". If none, "none".

**LOGGING validation**:
- Verify VPCE network events: Cross-check the LOGGING section's claim against
  checkpoint-results.json `vpce_network_events`. If the checkpoint says unsupported but the
  synthesis claims support, fix the synthesis.
- Verify data event resource types: Cross-check against the checkpoint. The synthesis must not
  claim data event types that are absent from the authoritative page.
- Verify namespace consistency: If the synthesis mentions `AWS/{X}` and `AWS/{Y}` for the same
  service, confirm both are real namespaces from documentation.

**INFRA validation**:
- Verify VPC endpoint service names: Every VPC endpoint service name mentioned must follow the
  format `com.amazonaws.{region}.{service}` (or variant). Fabricated service names are a
  validation failure.
- Verify CloudFormation resource type count: The number of CFN resource types listed should
  match the CFN template reference page for the service's prefix.

**DATA validation**:
- Verify FIPS endpoint: Cross-check the DATA section's FIPS claim against
  checkpoint-results.json `fips_endpoints`. If the definitive checkpoint says unsupported but
  the synthesis claims FIPS support, fix the synthesis.
- Verify per-resource encryption tiers: Each resource type should have its own encryption
  statement. A single "supports KMS encryption" for a multi-resource service is insufficient.

---

## Step 4: Questionnaire (if --questions provided)

If `--questions` was provided:
1. Load the questions file (use `python3 -c "from docx import Document; ..."` for .docx)
2. Number each as `[Q1]`, `[Q2]`, etc.
3. Detect section headers (short, no question mark, no question verbs) — give canned answers
4. Classify each question into the 5 domains
5. Synthesize answers from domain research:
   ```
   [A{number}] {Direction}. {Detailed answer with citations}
   ```
   Directions: Yes / No / Yes, partially / Not found in available AWS documentation
6. Verify against checkpoints — override contradicted answers
7. Write to `.service-approval/<slug>/01-assess/assessment-questionnaire.md`
8. Run post-processing: `python3 tools/post-process/fix_output.py .service-approval/<slug>/01-assess/assessment-questionnaire.md`

---

## Step 5: Assemble Summary and GAPS

Combine all domain sections in order: IAM, LOGGING, INFRA, DATA, INCIDENT.

Add a **GAPS SUMMARY** at the end. This table consolidates ALL non-FULLY SUPPORTED items
from ALL domain compliance matrices into a single table.

**Inclusion rules:**
- Include every row from every domain matrix that is NOT `FULLY SUPPORTED`
- Include: REQUIREMENT GAP, CUSTOMER ACTION REQUIRED, and PARTIALLY SUPPORTED rows
- Each item appears ONCE. If the same requirement appears in multiple domain matrices
  (e.g., RAM sharing in both IAM and INFRA), include it only in the most relevant domain
  and remove the duplicate from the other domain's matrix before assembling the summary.

**Counting rules:**
- `{N}` = count of rows with status `REQUIREMENT GAP` in the GAPS Summary table
- `{M}` = count of rows with status `CUSTOMER ACTION REQUIRED` in the GAPS Summary table
- `{P}` = count of rows with status `PARTIALLY SUPPORTED` in the GAPS Summary table
- PARTIALLY SUPPORTED rows are included in the table but NOT counted in either N or M
- COUNT THE ACTUAL TABLE ROWS AFTER WRITING. Do not estimate or pre-compute.
- **Arithmetic verification**: After writing the GAPS Summary, re-count the table rows by
  status and verify: N + M + P = total rows in the table. Also verify that the banner line
  "Total gaps: {N} | Total customer actions: {M}" matches the actual row counts. If they
  don't match, recount and fix before finalizing. This is a common error source.

**Consistency rule:**
- Each item's status in the GAPS Summary table MUST exactly match its status in the
  originating domain compliance matrix. If they differ, the domain matrix is authoritative.

```markdown
## GAPS Summary

**Total gaps: {N} | Total customer actions: {M}**

| # | Domain | Requirement | Status | Details |
|---|--------|-------------|--------|---------|
```

Write to `.service-approval/<slug>/01-assess/assessment-summary.md`:
```markdown
# Security Posture Assessment: {Service Name}

**Generated**: {YYYY-MM-DD}
**SAR Page**: {URL}

---

## [IAM] Identity and Access Management
{sections + compliance matrix}

## [LOGGING] Logging & Monitoring
{sections + compliance matrix}

## [INFRA] Infrastructure Protection
{sections + compliance matrix}

## [DATA] Data Protection
{sections + compliance matrix}

## [INCIDENT] Incident Response
{sections + compliance matrix}

## GAPS Summary
**Total gaps: {N} | Total customer actions: {M}**
{consolidated gaps table}
```

Run post-processing: `python3 tools/post-process/fix_output.py .service-approval/<slug>/01-assess/assessment-summary.md`

---

## Step 6: Cross-Domain Consistency Check

Review the full output for contradictions:
- Does IAM say "supports CMK" while DATA says "only AWS-managed keys"?
- Are encryption tiers consistent between DATA and other domains?
- Are VPC/network claims consistent between INFRA and LOGGING?
- Do INFRA and DATA agree on regional availability? The service-specific regions page
  (e.g., `docs.aws.amazon.com/{service}/latest/devguide/*-regions.html`) is authoritative.
  FAQ pages may list a subset. Use the higher count with the specific regions page as source.
- Are compliance program claims in DATA consistent with checkpoint-results.json? The
  checkpoint is authoritative.
- Does the same requirement appear in multiple domain matrices? Deduplicate — keep it in
  the most relevant domain only.

Flag contradictions: `> **CROSS-CHECK**: {description}`

---

## Output Verification

After all steps complete, verify:
- [ ] `.service-approval/<slug>/01-assess/sar-facts.json` exists and is valid JSON
- [ ] `.service-approval/<slug>/01-assess/checkpoint-results.json` exists and is valid JSON
- [ ] `.service-approval/<slug>/01-assess/iac-support.json` exists and is valid JSON
- [ ] `.service-approval/<slug>/01-assess/assessment-summary.md` exists with all 5 domain sections
- [ ] GAPS counts match actual table rows
- [ ] No leaked terminology (check CLAUDE.md terminology rules)
- [ ] No meta-commentary (check CLAUDE.md meta-commentary rules)
- [ ] If `--questions` provided: `.service-approval/<slug>/01-assess/assessment-questionnaire.md` exists

## Print Summary

```
Assessment complete:
  Service: {service-name}
  SAR: {total_actions} actions, {condition_keys} keys, {resource_types} resource types
  Checkpoints: {passed}/{total} verified
  IaC support: CFN {✓/✗} | TF {✓/✗} | CDK {L1/L2/✗} | CDKTF {✓/✗}
  Domains: IAM, LOGGING, INFRA, DATA, INCIDENT
  GAPS: {N} requirement gaps, {M} customer actions required
  Artifacts:
    - sar-facts.json
    - checkpoint-results.json
    - iac-support.json
    - assessment-summary.md
    [- assessment-questionnaire.md (if --questions)]
  Output: .service-approval/<slug>/01-assess/
```
