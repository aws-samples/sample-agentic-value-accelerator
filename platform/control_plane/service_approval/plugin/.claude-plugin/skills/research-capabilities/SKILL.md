---
name: research-capabilities
description: Discover AWS service security capabilities (IAM, encryption, network, logging, org-policies) using MCP servers and assessment artifacts. Produces research-capabilities.json consumed by the research merge step.
disable-model-invocation: false
argument-hint: '[--service=<name>]'
---

# Service Approval — Researcher: Capabilities

Discover the target AWS service's security capabilities across 5 domains using MCP servers
and any available assessment artifacts.

**Output:** `.service-approval/<slug>/02-research/research-capabilities.json`
**Schema:** `schemas/research-capabilities.schema.json` — encodes `phase: "research-capabilities"` const, `condition_keys[]` object form `{key, applies_to_actions[]}` (iter-14 Class F13 — strings-only arrays rejected), the 5 required capability sub-objects (iam / encryption / network / logging / organization_policies), and `abac_support` enum `{full, partial, none}`.

This is one of 3 focused research sub-skills. The orchestrator merges outputs from all 3
into the final `research.json`.

---

## Prerequisites

```bash
from tools.paths import phase_dir, mcp_log
research_dir = phase_dir(slug, "research")  # .service-approval/<slug>/02-research/
research_dir.mkdir(parents=True, exist_ok=True)
mcp_log(slug).touch()  # .service-approval/<slug>/mcp-calls.log
```

## Inputs

- `--service=<name>` — AWS service identifier (REQUIRED)

## Assessment Integration

Check for assessment artifacts:

```bash
test -f .service-approval/<slug>/01-assess/sar-facts.json && echo "SAR facts: OK" || echo "SAR facts: not found"
test -f .service-approval/<slug>/01-assess/checkpoint-results.json && echo "Checkpoints: OK" || echo "Checkpoints: not found"
```

### SAR Facts (`sar-facts.json`)

When present, this is the **authoritative** source for:
- `condition_keys[]` — definitive list of available condition keys
- `resource_types[]` — resource ARN patterns
- `permission_only_actions[]` — actions with no CloudTrail event
- `wildcard_only_actions[]` — actions that cannot be scoped to specific resources
- `service_linked_roles[]` — SLR permissions

**Skip redundant SAR page reads** when sar-facts.json exists.

### Checkpoint Results (`checkpoint-results.json`)

When present, provides **verified factual data** from source-of-truth pages:
- `rcp_support`: RCP applicability
- `declarative_policies`: Declarative policy support
- `fips_endpoints`: FIPS endpoint availability
- `ram_shareable`: RAM sharing capability
- `config_resource_types`: AWS Config resource types
- `cloudtrail_data_events`: CloudTrail data event support
- `scp_support`: SCP applicability

---

## MCP Call Logging

**Required: emit canonical `mcp:<server>:call` events to `pipeline.log` after EVERY MCP tool invocation.** The Stop hook's P1 check (`tools/validate/validate_pipeline_integrity.py` — see `_MCP_CALL_TOKEN_RE`) anchors on the `[mcp:<server>:call]` token; free-form `[Step N] [Capabilities] ...` lines are NOT counted. The `_hook_log` auto-mirror copies canonical events into `mcp-calls.log` for free.

After each MCP call, run:

```bash
python3 -m tools.validate.log \
    --slug <slug> \
    --phase 02-research \
    --source mcp:<server> \
    --verdict call \
    --message "<tool-name>: <one-line description of query>"
```

Substitute `<server>` with the actual MCP server name (`awsknowledge`, `aws-documentation`, `kb-search`, `awsiac`, etc.). Issue this command BEFORE the next agent action so a failure mid-run still leaves the audit trail. The legacy `[Step N] [Capabilities] ...` summary line is optional and may be appended to `mcp-calls.log` for human-readable narrative — it does NOT replace the canonical event.

---

## MCP Data Collection

### Source 1: Service Authorization Reference

**If `sar-facts.json` exists**: use it as the primary source. Skip SAR page read.

**Otherwise**: Use `awsknowledge` MCP to fetch the IAM service authorization reference:
- Actions table — all API actions with resource types, condition keys
- Condition keys — all service-specific condition keys
- Resource types — all resource ARN patterns

Read the FULL page with pagination (`start_index=0`, `start_index=30000`, `start_index=60000`, etc.)
until no more content is returned.

### Source 2: Security Documentation

Use `aws-documentation` MCP to read (adapt URLs per service):
1. Security overview
2. Identity and access management / how the service works with IAM
3. Data protection / encryption at rest and in transit
4. VPC / network configuration / PrivateLink
5. Cross-service confused deputy prevention
6. Resource-based policies
7. CloudTrail integration / logging and monitoring
8. Resilience / disaster recovery

### Source 3: Best Practices

Use `aws-documentation` MCP to search for:
- AWS Security Best Practices for the service
- Well-Architected Framework security guidance

### Source 4: Config & Compliance

Use `aws-documentation` MCP to find:
- AWS Config managed rules for the service
- CloudFormation Guard rules for the service

---

## Capability Discovery

Build a structured `capabilities{}` object from collected MCP data.

### IAM Capabilities

```json
{
  "iam": {
    "condition_keys": [
      {
        "key": "<service>:ConditionKeyName",
        "type": "String|Numeric|Date|Bool|ARN|ArrayOfString",
        "description": "...",
        "applies_to_actions": ["CreateX", "UpdateX"]
      }
    ],
    "resource_policies_supported": true,
    "resource_policy_types": ["Agent", "Gateway"],
    "permission_boundaries_applicable": true,
    "abac_support": "full|partial|none",
    "service_linked_roles": [
      {
        "role_name": "AWSServiceRoleFor...",
        "service_principal": "<service>.amazonaws.com",
        "permissions_summary": "..."
      }
    ],
    "cross_account_access": {
      "supported": true,
      "mechanism": "resource-based policy|RAM|cross-account role"
    },
    "permission_only_actions": ["Action1", "Action2"]
  }
}
```

**CRITICAL — condition_keys format:**
- MUST be an array of objects, NOT a dict with global/service_specific sub-keys
- Each object MUST have: `key`, `type`, `description`, `applies_to_actions`
- `applies_to_actions` lists the API actions this key can condition on
- Source: SAR page "Condition keys" column for each action row

**CRITICAL — applies_to_actions accuracy:**
- `applies_to_actions` MUST be sourced EXCLUSIVELY from the SAR page's Actions table.
  For each action row, the "Condition keys" column lists which keys apply to THAT action.
  Build the reverse index: for each condition key, collect the actions that list it.
- Do NOT infer applies_to_actions from service documentation descriptions, feature
  overviews, or logical reasoning about what "should" support a condition key.
- Common error: JWT/claim-based condition keys (e.g., `InboundJwtClaim/*`) are often
  described in docs as applying to "data-plane operations" but the SAR may restrict them
  to only 1-2 specific actions (e.g., token exchange). Always trust the SAR over prose.
- If sar-facts.json exists, cross-reference: every action in applies_to_actions must
  appear in sar-facts.json's action list. Actions not in the SAR = fabricated mapping.

**Empty-binding fallback for resource-scoped tag keys:**
- Some SAR pages define tag-based condition keys (e.g., `s3:BucketTag/${TagKey}`,
  `<service>:ResourceTag/${TagKey}` variants) in the Condition Keys section but do NOT
  bind them in the Actions table's Condition-keys column. This leaves sar-facts with an
  empty `applies_to_actions[]`, which the schema rejects.
- When `sar-facts.condition_keys[k].applies_to_actions` is empty AND the key name matches
  `^<service>:.*Tag/\$\{?TagKey\}?$` (i.e., is a resource-tag key on a specific resource
  type), derive the binding from sar-facts.actions: list every action whose name contains
  the resource-type fragment in the key name (e.g., `BucketTag` → actions with "Bucket"
  in the name). Record `source: "sar_tag_keys_fallback"` on the condition_key entry so
  downstream validators can distinguish derived bindings from SAR-verbatim ones.
- Do NOT use this fallback for non-tag keys — it only holds for resource-tag conditions
  where the SAR's omission is a documentation limitation, not an actual constraint.

**CRITICAL — permission_only_actions:**
- These are actions evaluated by IAM but with NO API call and NO CloudTrail event
- List ALL from the SAR page (typically: TagResource, UntagResource, etc.)
- This list is consumed by the api-surface sub-skill for cross-reference validation

### Encryption Capabilities

```json
{
  "encryption": {
    "at_rest": {
      "supported": true,
      "default": "AWS-owned|AWS-managed|Customer-managed",
      "kms_cmk_supported": true,
      "per_resource_encryption": [
        {
          "resource_type": "AWS::...",
          "encryption_parameter": "$.encryptionKeyArn",
          "key_types": ["AWS-owned", "AWS-managed", "Customer-managed CMK"]
        }
      ]
    },
    "in_transit": {
      "tls_enforced": true,
      "minimum_tls_version": "1.2",
      "fips_endpoints": false
    }
  }
}
```

**CRITICAL — encryption_parameter naming:**
- `encryption_parameter` MUST use the ACTUAL API parameter name from the Create* operation,
  not an assumed generic name. Different resources in the same service may use different
  field names (e.g., `kmsKeyArn` for Gateway but `encryptionKeyArn` for Memory).
- Cross-check each resource's Create* operation parameter list in the API documentation.
- Do NOT assume all resources use the same encryption parameter name.

Use checkpoint data for `fips_endpoints` if available.

### Network Capabilities

```json
{
  "network": {
    "vpc_support": true,
    "vpc_endpoints": [
      {
        "service_name": "com.amazonaws.<region>.<service>",
        "type": "Interface|Gateway",
        "endpoint_policy_supported": true
      }
    ],
    "private_link": true,
    "security_groups": true,
    "network_mode_options": ["PUBLIC", "VPC"]
  }
}
```

### Logging Capabilities

**CRITICAL — CloudTrail data events source of truth:**
Use the authoritative CloudTrail data events page as the SOLE source for data event
resource types. Read with pagination:
- `start_index=0`, `start_index=15000`, `start_index=30000`
- Continue until no more content

Use checkpoint data for Config resource types and CloudTrail data events if available.

```json
{
  "logging": {
    "cloudtrail": {
      "management_events": true,
      "data_events": {
        "supported": true,
        "resource_types": ["AWS::...:..."]
      },
      "network_events": false
    },
    "cloudwatch": {
      "namespace": "AWS/<Service>",
      "metrics": ["MetricName1", "MetricName2"],
      "logs_integration": true
    },
    "config_resource_types": ["AWS::...:..."],
    "xray_tracing": false
  }
}
```

### Organization Policy Capabilities

Use checkpoint data if available. Otherwise use MCP to check each policy type.

```json
{
  "organization_policies": {
    "scp_support": true,
    "rcp_support": false,
    "rcp_reason": "Service not in current RCP supported list",
    "declarative_policies": false,
    "ai_optout_policy": false,
    "tag_policies": true,
    "backup_policies": false
  }
}
```

---

## Build Resource List

From SAR data (sar-facts.json or MCP reads), compile the full list of resource types:

```json
{
  "resources": ["AgentRuntime", "Gateway", "Memory", "TokenVault"]
}
```

These are the service-specific resource type names from the SAR page.

---

## Write Output

Write `.service-approval/<slug>/02-research/research-capabilities.json`:

```json
{
  "phase": "research-capabilities",
  "service": "<service-name>",
  "capabilities": {
    "iam": { ... },
    "encryption": { ... },
    "network": { ... },
    "logging": { ... },
    "organization_policies": { ... }
  },
  "resources": [...],
  "doc_sources": ["https://docs.aws.amazon.com/..."]
}
```

**CRITICAL — `doc_sources` format:**
- MUST be a flat array of URL strings: `["https://...", "https://..."]`
- Do NOT use objects like `{"url": "...", "description": "..."}` — the merge step
  calls `set()` on this array, which crashes on unhashable dicts
- If you have extra metadata about a source, include it ONLY in the capabilities
  sub-objects, not in doc_sources

## Output Verification

Output validation runs automatically via PostToolUse hook. The JSON Schema (see Schema above) hard-fails on `condition_keys` being strings or missing the `key` field (iter-14 Class F13), phase-const mismatch, and missing capability sub-objects. `validate_state.py::check_research_capabilities` retains two conditional checks the schema cannot express: (1) every `condition_key` MUST have a non-empty `applies_to_actions[]` (schema allows empty to match pre-iter-14 archives), and (2) CloudTrail `data_events.supported=true` ⇒ `resource_types[]` non-empty.

## Print Summary

```
Research (capabilities) complete:
  Capabilities:
    - IAM condition keys:    {N}
    - Permission-only actions: {N}
    - Encryption resources:  {N}
    - VPC endpoints:         {N}
    - Config resource types: {N}
    - Org policy support:    SCP={Yes/No}, RCP={Yes/No}
  Resources:               {N}
  Doc sources:             {N}
  Assessment data used:    SAR={Yes/No}, Checkpoints={Yes/No}
  Output: .service-approval/<slug>/02-research/research-capabilities.json
```
