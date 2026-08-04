---
name: map
description: 'Map verified service capabilities against customer-provided control framework and threat model. Produces mapping-results.json, controls-catalog.md, and framework-mapping.md. Supports pluggable frameworks: CCMv4, NIST 800-53, CIS Benchmarks, ISO 27001, etc. Split into 4 focused sub-skills for better accuracy; this skill orchestrates them.'
disable-model-invocation: false
argument-hint: '[--framework=<ccmv4|nist|cis|iso>] [--framework-file=<path>]'
---

# Service Approval — Mapper v2

Map verified service capabilities against customer-provided inputs to produce security controls,
framework mappings, and traceability. This skill bridges the gap between capability discovery
(Research/Validate) and artifact generation (Generate).

> **Scope note (as of 2026-05-16):** the `intake` skill narrows interactive
> runs to CCMv4-only. Multi-framework branches (NIST 800-53 / CIS / ISO 27001)
> remain reachable via the `--framework=<type>` CLI flag for advanced
> operators who bypass intake. See `skills/intake/SKILL.md` for the rationale.

**Inputs:**
- `validated.json` — verified capabilities, API surface, and existing mitigations
- Customer control framework file (xlsx/json/md) from the input folder
- Customer threat model (Mitigation Report) from validated.json `existing_mitigations[]`

**Outputs:**
- `.service-approval/<slug>/04-map/mapping-results.json` — machine-readable mapping state
- `.service-approval/<slug>/04-map/controls-catalog.md` — controls inventory by Category x Scope matrix
- `.service-approval/<slug>/04-map/framework-mapping.md` — framework objective crosswalk

## Sub-Skill Architecture

This skill is split into 4 focused sub-skills that write to separate intermediate state files:

| Sub-Skill | Focus | Output | Depends On |
|-----------|-------|--------|------------|
| `map-parse-framework` | Parse framework file into normalized objectives | `map-framework-parsed.json` | None |
| `map-generate-controls` | Generate controls from mitigations x capabilities | `map-controls-generated.json` | `validated.json` |
| `map-framework-mapping` | Map controls to framework objectives with quality gates | `map-framework-mapped.json` | `map-framework-parsed.json`, `map-controls-generated.json` |
| `map-assemble` | Deterministic assembly + traceability + markdown reports | `mapping-results.json`, `controls-catalog.md`, `framework-mapping.md` | All 3 above + `validated.json` |

**Execution order:**
- Steps 1 and 2 are INDEPENDENT and can run in parallel
- Step 3 depends on Steps 1 + 2
- Step 4 depends on Steps 1 + 2 + 3

**When invoked directly** (via `/map`), this skill runs all 4 sub-skills sequentially.
**When invoked by the orchestrator**, the orchestrator can dispatch Steps 1+2 in parallel.

## Agent model rule

When spawning subagents (via the Agent tool) for parallel artifact generation, do NOT specify
a `model` parameter. Omitting `model` causes subagents to inherit the caller's model.

---

## Prerequisites

```python
from tools.paths import phase_dir, service_root
# slug derived by Phase 0 (Assess) Step 0b — read it from the resolved staging promotion
validate_dir = phase_dir(slug, "validate")  # .service-approval/<slug>/03-validate/
map_dir = phase_dir(slug, "map")             # .service-approval/<slug>/04-map/
assert (validate_dir / "validated.json").exists(), "ERROR: run validator first"
map_dir.mkdir(parents=True, exist_ok=True)
```

## Inputs

Parse arguments:
- `--framework=<type>` — framework identifier (default: auto-detect from file)
- `--framework-file=<path>` — explicit path to framework file (overrides auto-detection)

---

## Direct Invocation Mode (Sequential)

When this skill is invoked directly (not by orchestrator):

### Step 1: Run map-parse-framework
Follow ALL instructions in `skills/map-parse-framework/SKILL.md`.
Pass: `--framework`, `--framework-file` flags if provided.
Wait for `.service-approval/<slug>/04-map/map-framework-parsed.json`.

### Step 2: Run map-generate-controls
Follow ALL instructions in `skills/map-generate-controls/SKILL.md`.
Pass: `--service`, `--include-unverified` if set.
Wait for `.service-approval/<slug>/04-map/map-controls-generated.json`.

### Step 3: Run map-framework-mapping
Follow ALL instructions in `skills/map-framework-mapping/SKILL.md`.
Wait for `.service-approval/<slug>/04-map/map-framework-mapped.json`.

### Step 4: Run map-assemble
Follow ALL instructions in `skills/map-assemble/SKILL.md`.
Wait for `mapping-results.json`, `controls-catalog.md`, `framework-mapping.md`.

---

## Parallel Invocation Mode (Claude Code only)

When the orchestrator has the Agent tool available:

### Steps 1+2: Parallel dispatch

Dispatch both sub-skills simultaneously as background subagents:

```
Agent 1: map-parse-framework (background)
  Prompt: Full text of skills/map-parse-framework/SKILL.md + framework flags
  Output: map-framework-parsed.json

Agent 2: map-generate-controls (background)
  Prompt: Full text of skills/map-generate-controls/SKILL.md + --service flag
  Output: map-controls-generated.json
```

**IMPORTANT:** Dispatch both in a single message with 2 Agent tool calls.
Do NOT set `model` parameter — let subagents inherit the caller's model.

### Step 3: Framework mapping (foreground, after 1+2 complete)

When both complete, dispatch framework-mapping as foreground subagent:

```
Agent 3: map-framework-mapping (foreground)
  Prompt: Full text of skills/map-framework-mapping/SKILL.md
  Input: map-framework-parsed.json + map-controls-generated.json
  Output: map-framework-mapped.json
```

This is the most reasoning-heavy step. It MUST run in foreground to ensure quality gates pass.
If quality gates fail, the agent must fix them before writing output.

### Step 4: Assembly (foreground, after 3 completes)

Dispatch map-assemble as foreground subagent:

```
Agent 4: map-assemble (foreground)
  Prompt: Full text of skills/map-assemble/SKILL.md
  Input: All 3 intermediate files + validated.json
  Output: mapping-results.json + controls-catalog.md + framework-mapping.md
```

### Parallelism Summary

```
Step 1: Parse Framework     (background) ─┐
Step 2: Generate Controls   (background) ─┤
                                          ├─ Step 3: Framework Mapping (foreground)
                                          │
                                          └─ Step 4: Assemble (foreground)
```

Total agents: up to 4 (vs 1 in monolithic mode).
Steps 1+2 are fast (~5 min each). Step 3 is the bottleneck (~20-30 min).
Step 4 is mostly deterministic (~5 min).

---

## Final Validation

After all sub-skills complete, verify the final outputs:

```bash
# Verify all 3 output files exist
test -f .service-approval/<slug>/04-map/mapping-results.json && echo "OK: mapping-results.json" || echo "MISSING"
test -f .service-approval/<slug>/04-map/controls-catalog.md && echo "OK: controls-catalog.md" || echo "MISSING"
test -f .service-approval/<slug>/04-map/framework-mapping.md && echo "OK: framework-mapping.md" || echo "MISSING"

# Validate mapping-results.json
python3 -m json.tool .service-approval/<slug>/04-map/mapping-results.json > /dev/null && echo "OK: valid JSON" || echo "ERROR: invalid JSON"

# Quick stats
python3 -c "
import json
d = json.load(open('.service-approval/<slug>/04-map/mapping-results.json'))
fm = d.get('framework_mapping', [])
mapped = sum(1 for f in fm if f.get('status') == 'MAPPED')
na = sum(1 for f in fm if f.get('status') == 'N/A')
print(f'Controls: {len(d[\"controls\"])}')
print(f'Mitigations: {len(d[\"threat_mitigation_map\"])}')
print(f'Framework: {mapped} mapped, {na} N/A, {len(fm)} total')
print(f'Coverage gaps: {len(d.get(\"coverage_gaps\", []))}')
"
```

---

## Intermediate State File Cleanup

After successful assembly and validation, the intermediate files can optionally be cleaned up:
- `map-framework-parsed.json` — useful for debugging, keep
- `map-controls-generated.json` — useful for debugging, keep
- `map-framework-mapped.json` — useful for debugging, keep

Do NOT delete intermediate files by default. They aid debugging and allow re-running individual
sub-skills without starting from scratch.

---

## Print Summary

```
Map complete (v2):
  Sub-skills:
    - map-parse-framework:    {N} framework objectives parsed
    - map-generate-controls:  {N} controls generated
    - map-framework-mapping:  {mapped} mapped, {na} N/A, quality gates PASS
    - map-assemble:           mapping-results.json + catalog + mapping
  Artifacts:
    - controls-catalog.md    ({N} controls — matrix)
    - framework-mapping.md   ({mapped} mapped, {na} N/A)
    - mapping-results.json   (structured state for downstream skills)
  Traceability:
    - Mitigations addressed:   {N}/{total} ({pct}%)
    - Framework objectives:    {mapped}/{total} mapped, {na} N/A
    - Coverage gaps:           {N}
  Output: .service-approval/<slug>/04-map/
```
