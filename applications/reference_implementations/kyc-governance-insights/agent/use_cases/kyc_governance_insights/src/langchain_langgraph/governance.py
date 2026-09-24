"""
Governance client for KYC Controlled Quality Output.

Thin client the orchestrator uses to invoke the four external governance
services that ship with this use case:

  1. Deterministic financial check  (DETERMINISTIC_CHECK_FUNCTION)
  2. Sanctions / PEP screening       (SANCTIONS_CHECK_FUNCTION / PEP_CHECK_FUNCTION)
  3. Three-layer policy cascade      (POLICY_CASCADE_FUNCTION)
  4. LLM-as-Judge quality scoring    (LLM_JUDGE_FUNCTION)

Each service is a Lambda function invoked directly with IAM auth (the AgentCore
runtime role holds lambda:InvokeFunction). Its NAME is injected via an environment
variable at deploy time, sourced from SSM.

These services used to sit behind public HTTP APIs with no authorizer, which meant
anyone who discovered a URL could screen names against the sanctions list, read the
match thresholds out of the responses, or run the LLM judge on our Bedrock budget.
Direct invoke removes the public surface rather than guarding it.

GOVERNANCE_MODE controls enforcement. Under the default "external" the deployed
services are authoritative and an unreachable or unconfigured service fails CLOSED —
the client returns a degraded marker and never substitutes the in-process answer, so
the agent cannot silently self-govern. "local" selects the in-process equivalents for
standalone/dev runs; their thresholds mirror the deployed services exactly.
"""

from __future__ import annotations

import json
import os
from difflib import SequenceMatcher
from typing import Any

import boto3
import structlog
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError

logger = structlog.get_logger(__name__)

# Thresholds — kept in sync with the deployed governance services.
SANCTIONS_THRESHOLD = float(os.getenv("SANCTIONS_THRESHOLD", "0.70"))
PEP_THRESHOLD = float(os.getenv("PEP_THRESHOLD", "0.60"))
RISK_ESCALATE_THRESHOLD = int(os.getenv("RISK_ESCALATE_THRESHOLD", "60"))
RISK_BLOCK_THRESHOLD = int(os.getenv("RISK_BLOCK_THRESHOLD", "80"))

# Deterministic-check tolerances (agent-claimed vs recomputed).
_RATIO_TOL = 0.05
_PCT_TOL = 1.0

_INVOKE_TIMEOUT = float(os.getenv("GOVERNANCE_INVOKE_TIMEOUT",
                                  os.getenv("GOVERNANCE_HTTP_TIMEOUT", "10")))

# Governance services are invoked directly as Lambda functions, authenticated with the
# AgentCore runtime's IAM role. They previously sat behind public HTTP APIs with no
# authorizer, so anyone who learned a URL could read the sanctions list, discover the
# match thresholds, or run the LLM judge at our expense. Direct invoke removes the
# public surface entirely: there is no endpoint to reach, and lambda:InvokeFunction is
# granted only to the runtime role.
_lambda_client = None


def _client():
    """Lazily build the Lambda client so import never depends on AWS being reachable."""
    global _lambda_client
    if _lambda_client is None:
        _lambda_client = boto3.client(
            "lambda",
            config=BotoConfig(
                read_timeout=_INVOKE_TIMEOUT,
                connect_timeout=5,
                retries={"max_attempts": 2, "mode": "standard"},
            ),
        )
    return _lambda_client

# Enforcement mode (config, not code). "external" (default) makes the deployed
# governance microservices the source of truth: enforcement happens OUTSIDE the
# agent process, and on an unreachable/misconfigured service the client fails
# LOUD — returning a degraded marker (never the in-process answer), so the agent
# can never silently self-govern. "local" selects the in-process equivalents, for
# standalone/dev runs and any use case that does not deploy the companion stack.
GOVERNANCE_MODE = os.getenv("GOVERNANCE_MODE", "external").strip().lower()


def _call(function_name: str, payload: dict) -> dict | None:
    """Invoke a governance Lambda; return its parsed payload or None on failure.

    Authenticated by the AgentCore runtime's IAM role — there is no endpoint and no
    shared secret. Returns None on any failure so the caller can fail closed; it must
    never fall through to an in-process answer.
    """
    try:
        resp = _client().invoke(
            FunctionName=function_name,
            InvocationType="RequestResponse",
            Payload=json.dumps(payload).encode("utf-8"),
        )
        # An unhandled exception inside the function still returns HTTP 200 with
        # FunctionError set, so this has to be checked explicitly.
        if resp.get("FunctionError"):
            logger.error("governance_function_error",
                         function=function_name,
                         error=resp["FunctionError"],
                         detail=resp["Payload"].read().decode("utf-8", "replace")[:300])
            return None

        parsed = json.loads(resp["Payload"].read().decode("utf-8"))
        # The handlers still return an API-Gateway-shaped {"statusCode", "body"} envelope,
        # so unwrap it. A non-2xx statusCode is a failure, not a verdict.
        if isinstance(parsed, dict) and "statusCode" in parsed:
            status = parsed.get("statusCode")
            body = parsed.get("body")
            if isinstance(body, str):
                try:
                    body = json.loads(body)
                except json.JSONDecodeError:
                    body = {"raw": body}
            if not (isinstance(status, int) and 200 <= status < 300):
                logger.error("governance_function_non_2xx",
                             function=function_name, status=status, body=body)
                return None
            return body
        return parsed
    except (BotoCoreError, ClientError, json.JSONDecodeError, KeyError, ValueError) as e:
        logger.warning("governance_service_call_failed",
                       function=function_name, error=str(e))
        return None


def _invoke(service: str, fn_env: str, payload: dict, local_fn):
    """Route a governance check per GOVERNANCE_MODE.

    local    -> in-process equivalent (local_fn).
    external -> the deployed service is authoritative. Return its response on
                success; on an unreachable/misconfigured service DO NOT fall back
                to local_fn (that would be silent self-governance) — return a
                degraded marker the caller converts into a fail-closed result.
    """
    if GOVERNANCE_MODE == "local":
        return local_fn()
    function_name = os.getenv(fn_env)
    if function_name:
        result = _call(function_name, payload)
        if result is not None:
            return result
        logger.error("governance_service_unreachable",
                     service=service, function=function_name, mode="external")
        return {"degraded": True, "governance_error": "service_unreachable", "service": service}
    logger.error("governance_function_name_missing", service=service, env_var=fn_env, mode="external")
    return {"degraded": True, "governance_error": "function_not_configured", "service": service}


# --- 1. Deterministic financial check ------------------------------------

def deterministic_check(raw_financials: dict, agent_claims: dict) -> dict:
    """Independently recompute financial ratios and compare to agent claims."""
    result = _invoke(
        "deterministic_check", "DETERMINISTIC_CHECK_FUNCTION",
        {"raw_financials": raw_financials, "agent_claims": agent_claims},
        lambda: _deterministic_check_local(raw_financials, agent_claims),
    )
    if result.get("degraded"):
        # Loud, not silent: no in-process recompute substituted. overall is left
        # UNKNOWN; run_governance fails the overall decision closed to ESCALATE.
        return {"overall": "UNKNOWN", "checks": [], "degraded": True,
                "governance_error": result.get("governance_error")}
    return result


def _deterministic_check_local(raw: dict, claims: dict) -> dict:
    """In-process equivalent of the deterministic-check Lambda."""
    def _f(v: Any, default: float = 0.0) -> float:
        try:
            return float(v)
        except (TypeError, ValueError):
            return default

    total_liabilities = _f(raw.get("total_liabilities"))
    total_assets = _f(raw.get("total_assets"))
    equity = total_assets - total_liabilities
    current_assets = _f(raw.get("current_assets"))
    current_liabilities = _f(raw.get("current_liabilities"))
    revenue = _f(raw.get("revenue"))
    net_income = _f(raw.get("net_income"))
    payments_on_time = _f(raw.get("payments_on_time"))
    payments_total = _f(raw.get("payments_total"))

    de_ratio = round(total_liabilities / equity, 2) if equity > 0 else 999.99
    current_ratio = round(current_assets / current_liabilities, 2) if current_liabilities > 0 else 999.99
    net_margin = round(net_income / revenue, 4) if revenue > 0 else 0.0
    payment_pct = round(payments_on_time / payments_total * 100, 2) if payments_total > 0 else 0.0

    computed = {
        "de_ratio": (de_ratio, _RATIO_TOL),
        "current_ratio": (current_ratio, _RATIO_TOL),
        "net_margin": (net_margin, 0.01),
        "payment_pct": (payment_pct, _PCT_TOL),
    }

    checks = []
    overall = "PASS"
    for metric, (value, tol) in computed.items():
        stated = claims.get(metric)
        if stated is None:
            result = "PASS"
        else:
            result = "PASS" if abs(_f(stated) - value) <= tol else "FAIL"
        if result == "FAIL":
            overall = "FAIL"
        checks.append({
            "metric": metric,
            "computed": value,
            "agent_stated": _f(stated) if stated is not None else None,
            "result": result,
        })
    return {"overall": overall, "checks": checks}


# --- 2. Sanctions / PEP screening -----------------------------------------

# SANCTIONS_CHECK_FUNCTION and PEP_CHECK_FUNCTION resolve to the SAME Lambda: one service
# performs both screenings against two different DynamoDB lists and thresholds. Under API
# Gateway the URL path (/sanctions-check vs /pep-check) told it which to run. A direct
# invoke carries no path, so "check" must be sent explicitly — without it every PEP request
# is screened against the sanctions list at the sanctions threshold and pep_level comes back
# null, so the cascade's PEP rule can never fire. Both calls state their check; neither
# relies on the service's default.

def sanctions_check(name: str) -> dict:
    """Screen a name against the sanctions watch list (fuzzy match)."""
    result = _invoke(
        "sanctions_check", "SANCTIONS_CHECK_FUNCTION", {"name": name, "check": "sanctions"},
        lambda: _screen_local(name, _FALLBACK_SANCTIONS, SANCTIONS_THRESHOLD, "OFAC SDN"),
    )
    if result.get("degraded"):
        return _degraded_screen(SANCTIONS_THRESHOLD, result.get("governance_error"))
    return result


def pep_check(name: str) -> dict:
    """Screen a name against the PEP list (fuzzy match)."""
    result = _invoke(
        "pep_check", "PEP_CHECK_FUNCTION", {"name": name, "check": "pep"},
        lambda: _screen_local(name, _FALLBACK_PEP, PEP_THRESHOLD, "PEP"),
    )
    if result.get("degraded"):
        return _degraded_screen(PEP_THRESHOLD, result.get("governance_error"))
    return result


def _degraded_screen(threshold: float, error: str | None) -> dict:
    """Degraded screening result — no local watch-list match substituted."""
    return {"matched": False, "score": 0.0, "matched_name": None, "list": None,
            "entry_id": None, "level": None, "threshold": threshold,
            "degraded": True, "governance_error": error}


# Minimal built-in lists so the demo scenarios work without the companion stack.
# The deployed sanctions service reads richer lists from DynamoDB.
_FALLBACK_SANCTIONS = [
    {"name": "Viktor Petrov", "list_name": "OFAC SDN", "entry_id": "SDN-28934"},
    {"name": "Volkov Enterprises LLC", "list_name": "OFAC SDN", "entry_id": "SDN-31847"},
    {"name": "Omega Trading Ltd", "list_name": "OFSI Consolidated List", "entry_id": "OFSI/2024/1892"},
]
_FALLBACK_PEP = [
    {"name": "Kensington Holdings SA", "list_name": "PEP", "entry_id": "PEP-001", "level": 1},
]


def _fuzzy(a: str, b: str) -> float:
    return round(SequenceMatcher(None, a.lower(), b.lower()).ratio(), 2)


def _screen_local(name: str, entries: list[dict], threshold: float, default_list: str) -> dict:
    best = {"score": 0.0, "matched_name": None, "list_name": None, "entry_id": None, "level": None}
    for entry in entries:
        score = _fuzzy(name or "", entry["name"])
        if score > best["score"]:
            best = {
                "score": score,
                "matched_name": entry["name"],
                "list_name": entry.get("list_name", default_list),
                "entry_id": entry.get("entry_id"),
                "level": entry.get("level"),
            }
    return {
        "matched": best["score"] >= threshold,
        "score": best["score"],
        "matched_name": best["matched_name"],
        "list": best["list_name"],
        "entry_id": best["entry_id"],
        "level": best["level"],
        "threshold": threshold,
    }


# --- 3. Three-layer policy cascade ----------------------------------------

def policy_cascade(context: dict) -> dict:
    """Evaluate the ORG/APP/REQUEST policy cascade for a request context.

    SHADOW MODE (show-but-don't-block) — deliberate. This returns a deterministic
    ALLOW/ESCALATE/BLOCK decision that the pipeline maps into the final
    ``AssessmentResponse.decision`` (see ``governance_pipeline._map_decision``).
    That is *decision-level* enforcement: the governance layer owns the outcome and
    the agents cannot override a BLOCK. It NEVER raises/aborts on DENY — a BLOCK is a
    returned value rendered as a clean decision card, not an exception. Do NOT add a
    runtime-abort "enforce" mode (there is intentionally no POLICY_CASCADE_MODE flag);
    it would break the live Omega demo and add no governance value.
    See docs/DESIGN_DECISION_CEDAR_SHADOW_MODE.md (do not change without sign-off).
    """
    # Thread the tenant so the service loads that tenant's policy config from the
    # store (defaults to "default"). Env-overridable for multi-tenant deployments.
    payload = {**context, "tenantId": context.get("tenantId") or os.getenv("KYC_TENANT_ID", "default")}
    result = _invoke("policy_cascade", "POLICY_CASCADE_FUNCTION", payload,
                     lambda: _policy_cascade_local(payload))
    if result.get("degraded"):
        # Fail closed (loud): the enforcement service owns the decision; if it is
        # unreachable we escalate to human review rather than self-decide. Still
        # shadow mode — a returned ESCALATE value, not a runtime abort.
        reason = "Governance policy-cascade service unreachable — failing closed to human review"
        return {"decision": "ESCALATE", "deciding_layer": "REQ", "deciding_rule": "GOV-DEGRADED",
                "reason": reason, "degraded": True, "governance_error": result.get("governance_error"),
                "evaluations": [{"layer": "REQ", "rule": "GOV-DEGRADED", "result": "ESCALATE", "reason": reason}]}
    return result


def _policy_cascade_local(ctx: dict) -> dict:
    """In-process equivalent of the policy cascade. Most-restrictive-wins."""
    risk_score = int(ctx.get("riskScore", ctx.get("risk_score", 0)) or 0)
    sanctions_hit = bool(ctx.get("sanctionsHit", ctx.get("sanctions_hit", False)))
    pep_flag = bool(ctx.get("pepFlag", ctx.get("pep_flag", False)))
    fatf_high_risk = bool(ctx.get("fatfHighRisk", ctx.get("fatf_high_risk", False)))
    jurisdiction = (ctx.get("jurisdiction") or "").upper()
    prohibited = {"KP", "IR", "SY", "MM"}

    evaluations: list[dict] = []

    # ORG layer — immutable hard gates.
    if sanctions_hit:
        evaluations.append({"layer": "ORG", "rule": "ORG-001", "result": "BLOCK",
                            "reason": "Sanctions match exceeds threshold — MLRO escalation required"})
    if jurisdiction in prohibited:
        evaluations.append({"layer": "ORG", "rule": "ORG-002", "result": "BLOCK",
                            "reason": f"Prohibited jurisdiction: {jurisdiction}"})
    if pep_flag:
        evaluations.append({"layer": "ORG", "rule": "ORG-004", "result": "ESCALATE",
                            "reason": "PEP flag present — enhanced due diligence required"})
    if fatf_high_risk:
        evaluations.append({"layer": "ORG", "rule": "ORG-005", "result": "ESCALATE",
                            "reason": "Operations in FATF high-risk / conflict-zone jurisdiction — board approval required"})

    # APP layer — risk-based gating.
    if risk_score >= RISK_BLOCK_THRESHOLD:
        evaluations.append({"layer": "APP", "rule": "APP-006", "result": "BLOCK",
                            "reason": f"Risk score {risk_score} >= block threshold {RISK_BLOCK_THRESHOLD}"})
    elif risk_score >= RISK_ESCALATE_THRESHOLD:
        evaluations.append({"layer": "APP", "rule": "APP-RISK", "result": "ESCALATE",
                            "reason": f"Risk score {risk_score} >= escalate threshold {RISK_ESCALATE_THRESHOLD}"})

    # REQ layer — default allow when nothing above fired.
    if not evaluations:
        evaluations.append({"layer": "REQ", "rule": "REQ-000", "result": "ALLOW",
                            "reason": "All governance gates passed"})

    # Most-restrictive-wins: BLOCK > ESCALATE > ALLOW.
    order = {"BLOCK": 3, "ESCALATE": 2, "ALLOW": 1}
    deciding = max(evaluations, key=lambda e: order[e["result"]])
    decision_map = {"BLOCK": "BLOCK", "ESCALATE": "ESCALATE", "ALLOW": "ALLOW"}

    return {
        "decision": decision_map[deciding["result"]],
        "deciding_layer": deciding["layer"],
        "deciding_rule": deciding["rule"],
        "reason": deciding["reason"],
        "evaluations": evaluations,
    }


# --- 4. LLM-as-Judge -------------------------------------------------------

def llm_judge(agent_output: str) -> dict:
    """Score an agent's assessment text on the five quality dimensions."""
    def _local():
        # No local model call — neutral scores flagged as unscored.
        return {"correctness": 0.0, "faithfulness": 0.0, "completeness": 0.0,
                "helpfulness": 0.0, "tone": 0.0, "model": "unscored (local mode)"}

    result = _invoke("llm_judge", "LLM_JUDGE_FUNCTION",
                     {"agent_output": (agent_output or "")[:4000]}, _local)
    if result.get("degraded"):
        return {"correctness": 0.0, "faithfulness": 0.0, "completeness": 0.0,
                "helpfulness": 0.0, "tone": 0.0, "model": "degraded (judge service unreachable)"}
    return result.get("scores", result)
