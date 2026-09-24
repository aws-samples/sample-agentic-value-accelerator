#!/usr/bin/env python3
"""Contract + behavior tests for the policy-cascade service (Warning #1).

SINGLE SOURCE OF TRUTH: the deployed handler is the inline `Code.ZipFile` in
template.yaml. This test EXTRACTS that inline code and tests it directly, so the
test validates exactly what production runs — there is no separate .py copy to
drift from the deployed code.

Asserts:
  1. The response schema is unchanged after moving thresholds to the config store
     (decision, deciding_layer, deciding_rule, reason, evaluations[{layer,rule,result,reason}]).
  2. The demo decisions hold with the baseline config (Acme -> ALLOW, Omega -> BLOCK).
  3. Thresholds are genuinely config-driven (a different config changes the boundary).

Run: python3 test_contract.py
"""
import os
import sys

import yaml


class _CfnLoader(yaml.SafeLoader):
    pass


def _any(loader, tag_suffix, node):
    if isinstance(node, yaml.ScalarNode):
        return loader.construct_scalar(node)
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node)
    return loader.construct_mapping(node)


_CfnLoader.add_multi_constructor('!', _any)


def _load_inline_handler():
    """Extract the Lambda inline ZipFile from template.yaml and exec it.

    Module-level boto3 is lazy (no client is created at import), so exec does not
    require AWS credentials/region.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    doc = yaml.load(open(os.path.join(here, "template.yaml")), Loader=_CfnLoader)
    code = None
    for _name, res in doc.get("Resources", {}).items():
        if res.get("Type") == "AWS::Lambda::Function":
            c = res.get("Properties", {}).get("Code", {})
            if isinstance(c, dict) and "ZipFile" in c:
                code = c["ZipFile"]
                break
    if not code:
        print("IMPORT_FAILED: no inline Code.ZipFile found in template.yaml")
        sys.exit(1)
    ns: dict = {}
    exec(compile(code, "<policy-cascade-inline>", "exec"), ns)  # noqa: S102 - trusted own template
    return ns


_ns = _load_inline_handler()
evaluate = _ns.get("evaluate")
if evaluate is None:
    print("IMPORT_FAILED: inline handler has no evaluate(ctx, cfg)")
    sys.exit(1)

BASELINE = {"risk_escalate_threshold": 60, "risk_block_threshold": 80,
            "prohibited_jurisdictions": {"KP", "IR", "SY", "MM"}}

REQUIRED_TOP = {"decision", "deciding_layer", "deciding_rule", "reason", "evaluations"}
REQUIRED_EVAL = {"layer", "rule", "result", "reason"}
VALID_DECISIONS = {"ALLOW", "ESCALATE", "BLOCK"}

failures = []


def check(name, cond):
    print(f"{'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        failures.append(name)


def schema_ok(r):
    if set(r.keys()) != REQUIRED_TOP:
        return False
    if r["decision"] not in VALID_DECISIONS:
        return False
    if not isinstance(r["evaluations"], list) or not r["evaluations"]:
        return False
    return all(REQUIRED_EVAL.issubset(e.keys()) for e in r["evaluations"])


# 1. Schema
r = evaluate({"riskScore": 81, "sanctionsHit": True, "jurisdiction": "GB"}, BASELINE)
check("schema: exact top-level keys + evaluation shape", schema_ok(r))

# 2. Demo behavior with baseline config
check("Acme (clean, low risk) -> ALLOW",
      evaluate({"riskScore": 20, "sanctionsHit": False, "pepFlag": False, "jurisdiction": "GB"}, BASELINE)["decision"] == "ALLOW")
omega = evaluate({"riskScore": 85, "sanctionsHit": True, "jurisdiction": "GB"}, BASELINE)
check("Omega (sanctions hit) -> BLOCK via ORG-001", omega["decision"] == "BLOCK" and omega["deciding_rule"] == "ORG-001")
check("risk 80 -> BLOCK via APP-006", evaluate({"riskScore": 80}, BASELINE)["deciding_rule"] == "APP-006")
check("risk 65 -> ESCALATE via APP-RISK", evaluate({"riskScore": 65}, BASELINE)["deciding_rule"] == "APP-RISK")
check("prohibited jurisdiction KP -> BLOCK via ORG-002", evaluate({"jurisdiction": "KP"}, BASELINE)["deciding_rule"] == "ORG-002")

# 3. Config-driven boundary
low = {"risk_escalate_threshold": 50, "risk_block_threshold": 80, "prohibited_jurisdictions": set()}
check("config-driven: risk 55 ESCALATEs when escalate threshold=50", evaluate({"riskScore": 55}, low)["decision"] == "ESCALATE")
check("config-driven: risk 55 ALLOWs under baseline (threshold=60)", evaluate({"riskScore": 55}, BASELINE)["decision"] == "ALLOW")
check("config-driven: MM blocked under baseline", evaluate({"jurisdiction": "MM"}, BASELINE)["decision"] == "BLOCK")
check("config-driven: MM allowed when prohibited list empty", evaluate({"jurisdiction": "MM"}, low)["decision"] == "ALLOW")

print("=" * 40)
if failures:
    print(f"FAILED: {len(failures)} check(s): {failures}")
    sys.exit(1)
print("ALL CONTRACT + BEHAVIOR CHECKS PASSED (against the deployed inline handler)")
