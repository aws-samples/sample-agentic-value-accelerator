---
name: research-v3
description: AWS service capability discovery producing research.json with structured capabilities, API surface, and existing mitigations. Uses MCP servers for AWS documentation, service authorization, and best practices. Downstream skills (Validate, Map) consume this output. Split into 3 focused sub-skills for better accuracy; this skill orchestrates and merges.
disable-model-invocation: false
argument-hint: '[./input-folder] [--service=<name>]'
---

# Service Approval — Researcher v3

Analyze the target AWS service to discover its security capabilities and API surface.
Produce a single structured output consumed by downstream skills.

**Output:** `.service-approval/<slug>/02-research/research.json`

---

## Sub-Skill Architecture

This skill is split into 3 core sub-skills plus 1 optional enrichment sub-skill:

| Sub-Skill | Focus | Output | Required |
|-----------|-------|--------|----------|
| `research-mitigations` | Input parsing, mitigations, assets, assessment gaps | `research-mitigations.json` | Yes |
| `research-capabilities` | IAM, encryption, network, logging, org-policies via MCP | `research-capabilities.json` | Yes |
| `research-api-surface` | Complete API operations, parameters, cross-ref validation | `research-api-surface.json` | Yes |
| `research-attack-surface` | MITRE ATT&CK Cloud techniques, STRIDE bridge | `research-attack-surface.json` | No |

**When invoked directly** (via `/research`), this skill runs all sub-skills sequentially
and merges their outputs. **When invoked by the orchestrator**, the orchestrator dispatches
sub-skills in parallel (all 4 if ATT&CK enrichment is enabled) and calls the merge step below.

---

## Prerequisites

```bash
from tools.paths import phase_dir, mcp_log
research_dir = phase_dir(slug, "research")  # .service-approval/<slug>/02-research/
research_dir.mkdir(parents=True, exist_ok=True)
mcp_log(slug).touch()  # .service-approval/<slug>/mcp-calls.log
```

**MCP refresh decision (REQUIRED — ask the user when a prior research.json exists)**:
research-capabilities and research-api-surface call `awsknowledge` / `kb-search` /
`aws-documentation` MCPs for every capability and API parameter. If a prior `research.json`
exists, ask the user before re-running:

```bash
if [ -f .service-approval/<slug>/02-research/research.json ]; then
  mtime=$(stat -f "%Sm" -t "%Y-%m-%d" .service-approval/<slug>/02-research/research.json 2>/dev/null \
          || stat -c "%y" .service-approval/<slug>/02-research/research.json | cut -d' ' -f1)
  echo "Existing research.json dated $mtime"
fi
```

> A prior `research.json` exists (dated {mtime}). Re-running all 3 sub-skills will re-call
> every MCP for the target service (~20-40 calls).
>
>   (a) **Re-run all sub-skills** (recommended if AWS service has had recent releases,
>       input files changed, or >7 days old)
>   (b) **Reuse existing research.json** (faster; only safe if upstream SAR/inputs unchanged)
>
> Which? [a / b]

If (b), skip to merge step and proceed to /validate with the existing research.json.
Do not silently reuse. Log the decision to `mcp-calls.log`.

## Inputs

Parse arguments:
- `./input-folder` (optional) — read all `.md`, `.json`, `.xlsx`, `.pdf`, `.docx` files
- `--service=<name>` — AWS service identifier (e.g., `bedrock-agentcore`, `lambda`, `s3`)

If neither is provided, ask the user for a service name before proceeding.

---

## Direct Invocation Mode (Sequential)

When this skill is invoked directly (not by orchestrator):

### Step 1: Run research-mitigations
Follow ALL instructions in `skills/research-mitigations/SKILL.md`.
Pass: `./input-folder`, `--service`.
Wait for `.service-approval/<slug>/02-research/research-mitigations.json`.

### Step 2: Run research-capabilities
Follow ALL instructions in `skills/research-capabilities/SKILL.md`.
Pass: `--service`.
Wait for `.service-approval/<slug>/02-research/research-capabilities.json`.

### Step 3: Run research-api-surface
Follow ALL instructions in `skills/research-api-surface/SKILL.md`.
Pass: `--service`.
Wait for `.service-approval/<slug>/02-research/research-api-surface.json`.

### Step 3b (optional): Run research-attack-surface
Follow ALL instructions in `skills/research-attack-surface/SKILL.md`.
Pass: `--service`.
Wait for `.service-approval/<slug>/02-research/research-attack-surface.json`.
This step is optional — skip if ATT&CK enrichment is not needed.

### Step 4: Merge
Run the merge step below.

---

## Merge Step

This step combines the 3 sub-skill outputs into the final `research.json`.
It can be invoked by the orchestrator after all 3 sub-skills complete.

### Prerequisites for merge

```bash
test -f .service-approval/<slug>/02-research/research-mitigations.json && echo "mitigations: OK" || echo "ERROR"
test -f .service-approval/<slug>/02-research/research-capabilities.json && echo "capabilities: OK" || echo "ERROR"
test -f .service-approval/<slug>/02-research/research-api-surface.json && echo "api-surface: OK" || echo "ERROR"
```

All 3 files must exist before merging.

### Merge Logic

```python
import json

# Load sub-skill outputs
mit = json.load(open('.service-approval/<slug>/02-research/research-mitigations.json'))
cap = json.load(open('.service-approval/<slug>/02-research/research-capabilities.json'))
api = json.load(open('.service-approval/<slug>/02-research/research-api-surface.json'))

# Normalize sub-skill field name variations before merging
# Mitigations sub-skill may use 'resource_type' instead of 'cfn_type',
# and 'display_name' instead of 'name'. Normalize here.
for a in mit.get('assets_partial', []):
    if 'resource_type' in a and 'cfn_type' not in a:
        a['cfn_type'] = a.pop('resource_type')
    if 'display_name' in a and 'name' not in a:
        a['name'] = a.pop('display_name')

# Normalize api-surface: sub-skill may use 'action' instead of 'operation',
# or put operations at top level instead of under api_surface.operations
ops = api.get('api_surface', {}).get('operations', [])
if not ops:
    # Fallback: check if operations are at top level
    ops = api.get('operations', [])
    if ops:
        api.setdefault('api_surface', {})['operations'] = ops
for op in ops:
    if 'action' in op and 'operation' not in op:
        op['operation'] = op.pop('action')

# Normalize doc_sources: capabilities sub-skill may output objects instead of strings
def normalize_sources(sources):
    """Convert doc_sources to flat URL strings."""
    result = []
    for s in (sources or []):
        if isinstance(s, str):
            result.append(s)
        elif isinstance(s, dict) and 'url' in s:
            result.append(s['url'])
    return result

# Build merged assets
# Start with mitigations' partial assets, enrich with capabilities and API data
assets_by_cfn = {}
for a in mit.get('assets_partial', []):
    cfn = a.get('cfn_type', '')
    assets_by_cfn[cfn] = a

# Add assets for Create* operations not already covered by mitigations
service = mit.get('service', cap.get('service', api.get('service', '')))
for op in api.get('api_surface', {}).get('operations', []):
    op_name = op.get('operation', '')
    if not op_name.startswith('Create'):
        continue
    resource_name = op_name[6:]  # e.g., "AgentRuntime" from "CreateAgentRuntime"
    # Check if this resource already has an asset
    found = False
    for cfn in assets_by_cfn:
        if resource_name.lower() in cfn.lower() or resource_name.lower() in assets_by_cfn[cfn].get('name', '').lower():
            found = True
            break
    if not found:
        # Derive CFN prefix from sar-facts.json or existing assets
        cfn_prefix = ''
        sar = None
        try:
            sar = json.load(open('<slug>/01-assess/sar-facts.json'))
            cfn_prefix = sar.get('cfn_prefix', '')
        except: pass
        if not cfn_prefix:
            # Infer from existing assets
            for existing_cfn in assets_by_cfn:
                parts = existing_cfn.split('::')
                if len(parts) >= 2:
                    cfn_prefix = parts[1]
                    break
        cfn_type = f'AWS::{cfn_prefix}::{resource_name}' if cfn_prefix else f'AWS::Unknown::{resource_name}'
        assets_by_cfn[cfn_type] = {
            'name': resource_name,
            'cfn_type': cfn_type,
            'data_classification': '<needs enrichment from capabilities>',
            'trust_boundaries': [],
            'entry_points': [],
            'source': 'api-surface'
        }

# Resolve placeholder data_classification from capabilities data
# Infer classification from encryption tiers and resource purpose
enc = cap.get('capabilities', {}).get('encryption', {}).get('at_rest', {})
per_resource_enc = {e.get('resource_type', ''): e for e in enc.get('per_resource_encryption', [])}
for cfn, asset in assets_by_cfn.items():
    if asset.get('data_classification', '').startswith('<needs'):
        # Try to match by resource name in encryption config
        name_lower = asset.get('name', '').lower()
        matched = False
        for enc_rt, enc_info in per_resource_enc.items():
            if name_lower in enc_rt.lower():
                key_types = enc_info.get('key_types', [])
                if 'Customer-managed CMK' in key_types:
                    asset['data_classification'] = 'Confidential — supports CMK encryption'
                else:
                    asset['data_classification'] = 'Internal — AWS-managed encryption'
                matched = True
                break
        if not matched:
            asset['data_classification'] = 'Internal — service-managed resource'

# Enrich assets with entry_points from API surface
ops = api.get('api_surface', {}).get('operations', [])
for op in ops:
    op_name = op.get('operation', '')
    # Find matching asset and add to entry_points
    for cfn, asset in assets_by_cfn.items():
        resource_name = cfn.split('::')[-1] if '::' in cfn else ''
        if resource_name.lower() in op_name.lower():
            if 'entry_points' not in asset:
                asset['entry_points'] = []
            if op_name.startswith(('Create', 'Update', 'Delete', 'Invoke', 'Put')):
                if op_name not in asset['entry_points']:
                    asset['entry_points'].append(op_name)

# Deduplicate assets: merge assets with overlapping entry_points (same resource, different name)
# e.g., "Runtime" and "AgentRuntime" both have CreateAgentRuntime → keep one
# IMPORTANT: Exclude generic shared operations from overlap calculation —
# TagResource, UntagResource, ListTagsForResource, PutResourcePolicy, etc.
# are shared across all resource types and would cause false dedup merges.
GENERIC_OPS = {'TagResource', 'UntagResource', 'ListTagsForResource',
               'PutResourcePolicy', 'DeleteResourcePolicy', 'GetResourcePolicy'}
deduped = {}
for cfn, asset in assets_by_cfn.items():
    eps = frozenset(asset.get('entry_points', [])) - GENERIC_OPS
    merged = False
    for existing_cfn, existing_asset in deduped.items():
        existing_eps = frozenset(existing_asset.get('entry_points', [])) - GENERIC_OPS
        # If >50% overlap in non-generic entry_points, these are the same resource
        if eps and existing_eps and len(eps & existing_eps) > min(len(eps), len(existing_eps)) * 0.5:
            # Keep the one with more entry_points; merge the other's data
            if len(eps) > len(existing_eps):
                deduped[cfn] = asset
                del deduped[existing_cfn]
            merged = True
            break
    if not merged:
        deduped[cfn] = asset
assets_by_cfn = deduped

# Build final research.json
research = {
    "schema_version": "3.0",
    "service": mit.get('service', cap.get('service', api.get('service', ''))),
    "resources": cap.get('resources', []),
    "assets": list(assets_by_cfn.values()),
    "capabilities": cap.get('capabilities', {}),
    "api_surface": api.get('api_surface', {}),
    "existing_mitigations": mit.get('existing_mitigations', []),
    "assessment_gaps": mit.get('assessment_gaps', []),
    "doc_sources": list(set(
        normalize_sources(cap.get('doc_sources', [])) +
        normalize_sources(api.get('doc_sources', []))
    ))
}

# Add permission_only_actions to capabilities.iam — UNION from both sources
# Capabilities sub-skill discovers them from the SAR page, api-surface may find additional ones
# Normalize: sub-skills may output POAs as strings OR as objects with 'name' key
def normalize_poa(poa_list):
    result = []
    for item in (poa_list or []):
        if isinstance(item, str): result.append(item)
        elif isinstance(item, dict):
            name = item.get('name', item.get('action', ''))
            if name: result.append(name)
    return result
cap_poa = normalize_poa(cap.get('capabilities', {}).get('iam', {}).get('permission_only_actions', []))
api_poa = normalize_poa(api.get('api_surface', {}).get('permission_only_actions', []))
merged_poa = sorted(set(cap_poa) | set(api_poa))
if merged_poa:
    research['capabilities'].setdefault('iam', {})['permission_only_actions'] = merged_poa

# Load ATT&CK attack surface (optional — backward compatible)
import os
atk_path = '<slug>/02-research/research-attack-surface.json'
if os.path.isfile(atk_path):
    atk = json.load(open(atk_path))
    research['attack_surface'] = {
        'applicable_techniques': atk.get('applicable_techniques', []),
        'stride_to_attack_bridge': atk.get('stride_to_attack_bridge', []),
        'tactic_coverage_summary': atk.get('tactic_coverage_summary', {}),
        'customer_stride_profile': atk.get('customer_stride_profile', {})
    }

json.dump(research, open('.service-approval/<slug>/02-research/research.json', 'w'), indent=2)
```

### Merged Output Validation

Validation runs automatically via PostToolUse hook (validate_state.py Check S9).

If CRITICAL errors exist (especially condition key cross-reference failures), the merge
step must report them. The orchestrator should re-dispatch the api-surface sub-skill with
the missing action list.

### MCP Log Verification

Validation runs automatically via PostToolUse hook (validate_state.py Check S9).

## Print Summary

```
Research v3 complete:
  Output: .service-approval/<slug>/02-research/research.json (schema v3.0)
  Sub-skills:
    - Mitigations:     {N} mitigations, {N} assessment gaps
    - Capabilities:    {N} condition keys, {N} resources
    - API Surface:     {N} operations ({N}/{N} completeness)
  Merged:
    - Assets:          {N}
    - Operations:      {N}
    - Mitigations:     {N}
    - Doc sources:     {N}
    - MCP calls:       {N}
```
