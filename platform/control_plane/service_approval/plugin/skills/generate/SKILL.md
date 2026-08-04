---
name: generate-v3
description: Generate all security control artifacts and compliant IaC templates from mapping-results.json and validated.json. Split into 3 focused sub-skills for better accuracy; this skill orchestrates them.
disable-model-invocation: false
argument-hint: '[--service=<name>] [--include-unverified]'
---

# Service Approval — Control Generator v3

Read `.service-approval/<slug>/04-map/mapping-results.json` (produced by Mapper) for controls and
framework mappings. Read `.service-approval/<slug>/03-validate/validated.json` (produced by Validator v3)
for API surface and capabilities. Generate artifacts organized by the Controls Matrix
(Category x Scope). Write to `.service-approval/<slug>/05-generate/`.

## Sub-Skill Architecture

This skill is split into 3 focused sub-skills that write to separate directories:

| Sub-Skill | Focus | Output Directory |
|-----------|-------|-----------------|
| `generate-preventive` | SCPs, resource policies, KMS key policies, permission boundaries, tag policies, OPA, CFN Guard | `<slug>/05-generate/preventive/`, `<slug>/05-generate/proactive/` |
| `generate-detective` | Config rules, Lambda handlers, EventBridge, CloudWatch, SSM runbooks, Step Functions | `<slug>/05-generate/detective/`, `<slug>/05-generate/responsive/` |
| `generate-iac` | Terraform modules, CDK TypeScript, CloudFormation YAML, CDK for Terraform | `<slug>/05-generate/iac/` |

**When invoked directly** (via `/generate`), this skill runs all 3 sub-skills sequentially.
**When invoked by the orchestrator**, the orchestrator dispatches sub-skills in parallel.

## Agent model rule

When spawning subagents (via the Agent tool) for parallel artifact generation, do NOT specify
a `model` parameter. Omitting `model` causes subagents to inherit the caller's model.

---

## Prerequisites

**Hard gate — halts the run if upstream phases are incomplete.**

```bash
python3 -m tools.validate.check_phase_complete --slug <slug> --phase 03-validate || exit 2
python3 -m tools.validate.check_phase_complete --slug <slug> --phase 04-map || exit 2

mkdir -p .service-approval/<slug>/05-generate/{proactive,preventive,detective,responsive,iac}
mkdir -p .service-approval/<slug>/05-generate/proactive/opa-policies
mkdir -p .service-approval/<slug>/05-generate/responsive/lambda-remediator
mkdir -p .service-approval/<slug>/05-generate/detective/config-rule-lambdas
```

The check_phase_complete CLI verifies every required artifact (mapping-results.json,
controls-catalog.md, framework-mapping.md, validated.json, etc.) exists and is
non-stub. Without this gate, generate would silently skip controls when its
inputs are missing, producing an empty 05-generate/ tree.

Create Terraform module directories:
```bash
for asset in $(python3 -c "import json; d=json.load(open('.service-approval/<slug>/03-validate/validated.json')); [print(a['name'].lower().replace(' ','-')) for a in d['assets']]"); do
  mkdir -p ".service-approval/<slug>/05-generate/iac/modules/${asset}"
done
mkdir -p .service-approval/<slug>/05-generate/iac/modules/_shared
```

---

## Direct Invocation Mode (Sequential)

When this skill is invoked directly (not by orchestrator):

### Step 1: Run generate-preventive
Follow ALL instructions in `skills/generate-preventive/SKILL.md`.
Pass: `--service`, `--include-unverified` if set.
Wait for `<slug>/05-generate/preventive/` and `<slug>/05-generate/proactive/` to be populated.

### Step 2: Run generate-detective
Follow ALL instructions in `skills/generate-detective/SKILL.md`.
Pass: `--service`, `--include-unverified` if set.
Wait for `<slug>/05-generate/detective/` and `<slug>/05-generate/responsive/` to be populated.

### Step 3: Run generate-iac
Follow ALL instructions in `skills/generate-iac/SKILL.md`.
Pass: `--service`, `--include-unverified` if set.
Wait for `<slug>/05-generate/iac/` to be populated with all 4 formats.

### Step 4: Final Validation
Run the comprehensive validation below.

---

## Final Validation

Final validation runs automatically via PostToolUse hooks (validate_controls.py per-file checks) and Stop hook (validate_cross.py cross-artifact checks X1-X11).

---

## Phase 4 Inventory

After sub-skills finish, print a one-screen inventory of what was generated. This
gives the user (and Summarize) a quick view of category counts and which IaC formats
are actually present. Runs unconditionally — no HITL gate.

```bash
python3 - <<'PY'
import json
from pathlib import Path

root = Path(f".service-approval/{slug}/05-generate")
categories = ["preventive", "proactive", "detective", "responsive", "iac"]
counts = {c: sum(1 for _ in (root / c).rglob("*") if _.is_file()) if (root / c).exists() else 0
          for c in categories}

iac_formats = {}
iac_root = root / "iac"
if iac_root.exists():
    iac_formats["terraform"]      = (iac_root / "modules").exists()
    iac_formats["cloudformation"] = any(iac_root.glob("*.cfn.yaml")) or any(iac_root.glob("*.yaml"))
    iac_formats["cdk-typescript"] = any(iac_root.rglob("*.ts"))
    iac_formats["cdktf"]          = (iac_root / "cdktf").exists() or any(iac_root.rglob("cdktf.json"))

service = None
sj = Path(f".service-approval/{slug}/03-validate/validated.json")
if sj.exists():
    service = json.loads(sj.read_text()).get("service")

formats_present = ", ".join(k for k, v in iac_formats.items() if v) or "(none)"
print(f"Phase 4 complete — {service or '(unknown service)'}:")
for c in categories:
    print(f"  {c.capitalize():13} {counts[c]} files")
print(f"  IaC formats:  {formats_present}")
PY
```

---

## Print Summary

```
Control generation complete (v3):
  Sub-skills:
    - generate-preventive:  preventive/ + proactive/
    - generate-detective:   detective/ + responsive/
    - generate-iac:         iac/ (4 formats + {N} TF modules)
  Controls matrix:
    Org×Proactive:    tag-policy, OPA, cfn-guard [, scp-provisioning]
    Org×Preventive:   scp-policy [, ai-optout]
    Org×Detective:    config-org-rules, conformance-pack, cloudtrail-org-config
    Org×Responsive:   ssm-runbook-org
    Acc×Proactive:    cfn-guard-rules, cfn-hooks-policy, checkov-config, OPA
    Acc×Preventive:   permission-boundary
    Acc×Detective:    config-rules, eventbridge-rules, cloudwatch-alarms [, access-analyzer]
    Acc×Responsive:   lambda-remediator, ssm-runbook, stepfunctions-workflow
    Res×Preventive:   resource-policy [, kms-key-policy] [, rcp-policy]
    Res×Responsive:   stepfunctions-workflow (resource-level)
  IaC:          CDK, CFN, CDKTF + Terraform ({N} modules)
  Output: .service-approval/<slug>/05-generate/
```
