#!/usr/bin/env python3
"""Contract + behavior tests for the sanctions-pep service.

SINGLE SOURCE OF TRUTH: the deployed handler is the inline `Code.ZipFile` in
template.yaml. This test EXTRACTS that inline code and tests it directly, so the
test validates exactly what production runs.

Asserts:
  1. The screening response schema (matched, score, threshold, ...).
  2. Demo behavior: an exact sanctions-list hit -> matched (this is what drives
     Omega -> BLOCK via policy-cascade ORG-001).
  3. Thresholds are genuinely config-driven (the match flips around an injected
     threshold — nothing is hardcoded in the handler).
  4. Fail-loud: with no config store configured, threshold load raises
     ConfigUnavailable (invariant #5 — no silent in-code default).

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
    exec(compile(code, "<sanctions-pep-inline>", "exec"), ns)  # noqa: S102 - trusted own template
    return ns


_ns = _load_inline_handler()
screen = _ns.get("screen")
fuzzy_score = _ns.get("fuzzy_score")
load_thresholds = _ns.get("_load_thresholds")
ConfigUnavailable = _ns.get("ConfigUnavailable")
if not all([screen, fuzzy_score, load_thresholds, ConfigUnavailable]):
    print("IMPORT_FAILED: inline handler missing screen/fuzzy_score/_load_thresholds/ConfigUnavailable")
    sys.exit(1)

SANCTIONS_LIST = [
    {"name": "Omega Trading LLC", "list_name": "OFAC SDN", "entry_id": "SDN-4412"},
    {"name": "Some Other Entity", "list_name": "OFAC SDN", "entry_id": "SDN-0001"},
]
PEP_LIST = [
    {"name": "Ivan Petrov", "level": 3, "jurisdiction": "RU", "source": "WorldCheck"},
]

# Board-approved baseline thresholds (the values seeded into the config store).
SANCTIONS_TH = 0.70
PEP_TH = 0.60

failures = []


def check(name, cond):
    print(f"{'PASS' if cond else 'FAIL'}  {name}")
    if not cond:
        failures.append(name)


# 1. Schema
r = screen("Omega Trading LLC", SANCTIONS_LIST, SANCTIONS_TH, "sanctions")
check("schema: sanctions result keys",
      {"matched", "score", "matched_name", "list", "entry_id", "threshold"} == set(r.keys()))
rp = screen("Ivan Petrov", PEP_LIST, PEP_TH, "pep")
check("schema: pep result keys",
      {"matched", "score", "matched_name", "level", "jurisdiction", "source", "threshold"} == set(rp.keys()))

# 2. Demo behavior — exact sanctions hit matches (drives Omega -> BLOCK)
check("Omega exact sanctions hit -> matched", r["matched"] is True and r["matched_name"] == "Omega Trading LLC")
check("clean name -> no sanctions match",
      screen("Acme Manufacturing GmbH", SANCTIONS_LIST, SANCTIONS_TH, "sanctions")["matched"] is False)
check("PEP exact hit -> matched", rp["matched"] is True and rp["level"] == 3)

# 3. Config-driven threshold — the match flips around the injected value, proving
#    the threshold is not hardcoded in the handler.
partial = "Omega Trade"
s = fuzzy_score(partial, "Omega Trading LLC")
check(f"config-driven: score {s} matches when threshold just below",
      screen(partial, SANCTIONS_LIST, round(s - 0.01, 2), "sanctions")["matched"] is True)
check(f"config-driven: score {s} does NOT match when threshold just above",
      screen(partial, SANCTIONS_LIST, round(s + 0.01, 2), "sanctions")["matched"] is False)

# 4. Fail-loud: no config store configured (POLICY_CONFIG_TABLE empty in test env)
#    -> ConfigUnavailable, never a silent in-code default (invariant #5).
try:
    load_thresholds("default")
    check("fail-loud: _load_thresholds raises when no config store", False)
except ConfigUnavailable:
    check("fail-loud: _load_thresholds raises when no config store", True)

print("=" * 40)
if failures:
    print(f"FAILED: {len(failures)} check(s): {failures}")
    sys.exit(1)
print("ALL CONTRACT + BEHAVIOR CHECKS PASSED (against the deployed inline handler)")
