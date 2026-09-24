"""Auto-enrollment — draft an evaluation suite for a newly deployed agent.

Every deployment should arrive in Evaluation with a suite scaffold instead of
an empty editor. The foundry registry (offerings.json) knows each use case's
test entities and request type values; an advisory model call drafts the
expected-behavior text. Everything produced here is explicitly a DRAFT for a
human to review — auto-generated answer keys must never silently become the
bar an agent is judged against.
"""

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from services.evaluation_runner import JUDGE_MODEL_ID, _judge_client

logger = logging.getLogger(__name__)

DRAFT_MARK = "[DRAFT — auto-enrolled; review against the agent's sample data before relying on scores] "
_PII_SCOPE = (" PII scope: the identifier under review and names intrinsic to the report are IN scope; "
              "account numbers, national IDs, contact details, and addresses are OUT of scope.")


def _registry_path() -> Optional[Path]:
    """Resolve the foundry registry lazily and defensively: the repo-relative
    path only exists in a source checkout. In the container image the backend
    lives at /app/src (fewer parents) — resolving at import time crashed the
    whole backend on boot. Env override first; None when unavailable."""
    env = os.environ.get("FOUNDRY_REGISTRY_PATH")
    if env:
        return Path(env)
    candidates = [
        # Container image: Dockerfile copies applications/fsi_foundry/data → /app/fsi_foundry/data
        Path("/app/fsi_foundry/data/registry/offerings.json"),
    ]
    try:
        # Source checkout: repo-relative from backend/src/services/
        candidates.append(Path(__file__).resolve().parents[5] / "applications/fsi_foundry/data/registry/offerings.json")
    except IndexError:
        pass
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _load_registry() -> dict:
    path = _registry_path()
    if path is None:
        raise ValueError(
            "Foundry registry (offerings.json) is not available in this deployment — "
            "set FOUNDRY_REGISTRY_PATH or create the suite manually in the suite builder"
        )
    with open(path) as fh:
        return json.load(fh)


def _norm(s: object) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s or "").lower())


def _registry_entry_for(dep: dict) -> Optional[dict]:
    """Map a deployment to its registry entry.

    1. Foundry runtime naming convention ava_{code}_{framework}
       (e.g. ava_r01_strands → R01) — covers foundry-script deploys.
    2. Identity fields (template id, use-case id, deployment id, display
       name) matched against registry id / use_case_name / name, normalized
       to alphanumerics — covers platform-Deployments-flow deploys, whose
       runtimes carry arbitrary names.
    """
    use_cases = _load_registry().get("use_cases", [])

    arn = str(dep.get("runtimeArn", ""))
    marker = "runtime/ava_"
    if marker in arn:
        code = arn.split(marker, 1)[1].split("_", 1)[0].upper()
        for uc in use_cases:
            if str(uc.get("id", "")).upper() == code:
                return uc

    # Platform-flow template ids carry a "foundry-" prefix for foundry use
    # cases (stripped the same way throughout deployments.py) — strip it
    # BEFORE normalization or "foundry-fraud_detection" never matches R01.
    raw_candidates = [str(dep.get(k) or "") for k in ("templateId", "useCaseId", "deploymentId", "name")]
    raw_candidates = [c[len("foundry-"):] if c.startswith("foundry-") else c for c in raw_candidates]
    candidates = [c for c in (_norm(c) for c in raw_candidates) if len(c) >= 4]

    def keys_for(uc: dict) -> List[str]:
        ks = [_norm(uc.get("id")), _norm(uc.get("use_case_name")), _norm(uc.get("name"))]
        return [k for k in ks if len(k) >= 4]

    # Exact matches first across the whole registry: a "Fraud Detection Lite"
    # deployment must not prefix-bind to R01 when an exact entry exists.
    for uc in use_cases:
        if any(cand == k for k in keys_for(uc) for cand in candidates):
            return uc
    for uc in use_cases:
        keys = keys_for(uc)
        for cand in candidates:
            if any(cand.startswith(k) or k.startswith(cand) for k in keys):
                return uc
    return None


def _entity_field(uc: dict) -> str:
    # The registry's id_field records each use case's request key (e.g.
    # query for document_search, payment_id for payments). customer_id is
    # the fallback for entries without it; the draft marker tells the
    # reviewer to verify either way.
    return str(uc.get("id_field") or uc.get("entity_field") or "customer_id")


def _draft_expectations(uc: dict, entities: List[str], region: str) -> dict:
    """One advisory model call drafting an answer key per test entity."""
    client = _judge_client(region)
    prompt = (
        "Draft evaluation answer keys for an AI agent test suite.\n"
        f"Agent: {uc.get('name')} — {uc.get('description')}\n"
        f"Internal agents: {', '.join(a.get('name', '') for a in uc.get('agents', []))}\n"
        f"Test entities: {', '.join(entities)}\n\n"
        "For EACH entity write 2-3 sentences describing what a correct response must do: grounded in "
        "the entity's source records, consistent figures, correct regulatory framing for this domain, "
        "no fabricated facts, unknowns reported as unknown. Do not invent specific figures — the "
        "reviewer will add them from the sample data.\n"
        'Respond ONLY with JSON: {"expectations": {"<entity>": "<text>", ...}}'
    )
    result = client.converse(
        modelId=JUDGE_MODEL_ID,
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": 900, "temperature": 0},
    )
    text = result["output"]["message"]["content"][0]["text"]
    from services.evaluation_runner import _parse_judge_json

    return _parse_judge_json(text, require="expectations").get("expectations", {})


def _generic_draft(dep: dict) -> dict:
    """Fallback draft when the deployment matches no registry entry: still
    give the reviewer a one-click starting point instead of an error, with
    the placeholders shouting what must be filled in before running. Two
    flavors: agent deployments get verify-the-request-format guidance; web
    apps (no invocable runtime) get judge-only guidance — live invocation
    does not apply to them, so the case must carry a recorded output."""
    if dep.get("isWebApp"):
        case = {
            "id": "draft-001",
            "input": "REPLACE — describe the scenario or user journey this recorded output came from",
            "expectedBehavior": (
                DRAFT_MARK
                + f"{dep.get('name')} has no invocable agent runtime (web application or supporting service), so live "
                "evaluation does not apply. To evaluate it in judge-only mode: set agentResponse on this "
                "case to a REAL recorded output of the application (a report it produced, a decision "
                "summary, an exported answer) and describe here what a correct output must contain. "
                "Until agentResponse is filled in, Run Evaluation will refuse with a clear message "
                "rather than judge a placeholder."
                + _PII_SCOPE
            ),
        }
        name = f"{dep.get('name')} — Auto-enrolled draft suite (web app: paste recorded outputs)"
    else:
        case = {
            "id": "draft-001",
            "input": json.dumps({"customer_id": "REPLACE — an entity id this agent accepts"}, separators=(",", ":")),
            "expectedBehavior": (
                DRAFT_MARK
                + f"Correct response from {dep.get('name')}: grounded in the entity's source records with "
                "consistent figures, accurate regulatory framing for its domain, no fabricated facts, and "
                "unknowns reported as unknown. NOTE: this deployment could not be matched to the foundry "
                "catalog, so the case input's field name AND entity id above are placeholders — check the "
                "agent's request format and correct both before running."
                + _PII_SCOPE
            ),
        }
        name = f"{dep.get('name')} — Auto-enrolled draft suite (verify input format)"
    return {
        "id": f"suite-{uuid.uuid4().hex[:10]}",
        "name": name,
        "target_deployment_id": dep.get("deploymentId"),
        "cases": [case],
        "evaluators": [],
        "latency_sla_ms": 60000,
        "cost_budget_usd": 0.10,
        "draft": True,
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def draft_suite_for_deployment(dep: dict, region: str) -> dict:
    """Build a draft suite dict (same shape the suites API stores)."""
    uc = _registry_entry_for(dep)
    if not uc:
        return _generic_draft(dep)
    entities = list(uc.get("test_entities") or uc.get("test_customers") or [])[:3]
    if not entities:
        raise ValueError(f"Registry entry {uc.get('id')} lists no test entities")
    type_field = uc.get("type_field") or "assessment_type"
    type_value = (uc.get("type_values") or ["full"])[0]
    entity_field = _entity_field(uc)

    try:
        expectations = _draft_expectations(uc, entities, region)
    except Exception as exc:  # draft text is a nicety — enrollment must not fail on it
        logger.warning("expectation drafting failed, using template: %s", exc)
        expectations = {}

    cases = []
    for i, entity in enumerate(entities, 1):
        text = expectations.get(entity) or (
            f"Correct response for {entity}: grounded in that entity's source records with consistent "
            f"figures, appropriate regulatory framing for {uc.get('name')}, no fabricated facts, and "
            "unknowns reported as unknown."
        )
        cases.append({
            "id": f"draft-{i:03d}",
            "input": json.dumps({entity_field: entity, type_field: type_value}, separators=(",", ":")),
            "expectedBehavior": DRAFT_MARK + text + _PII_SCOPE,
        })

    return {
        "id": f"suite-{uuid.uuid4().hex[:10]}",
        "name": f"{dep.get('name')} — Auto-enrolled draft suite",
        "target_deployment_id": dep.get("deploymentId"),
        "cases": cases,
        "evaluators": [],
        "latency_sla_ms": 60000,
        "cost_budget_usd": 0.10,
        "draft": True,
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
