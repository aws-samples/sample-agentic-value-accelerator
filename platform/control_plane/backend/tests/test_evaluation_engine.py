"""Unit tests for the Operate → Evaluation engine — pure logic, no AWS.

Covers the failure modes found during live testing:
- request-rejection detection (so runs fail loudly instead of judging errors)
- judge JSON parsing (prose-wrapped / truncated output)
- gate aggregation and verdict logic, incl. the deterministic PII force-fail
- dict case inputs serialized as JSON, not Python repr
- the store's memory-fallback eviction on successful writes
"""

import importlib.util
import json
import os
import sys
from unittest.mock import MagicMock

SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, "src"))
sys.path.insert(0, SRC)


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(SRC, rel))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


runner = _load("evaluation_runner_ut", "services/evaluation_runner.py")


# --- request-rejection detection ------------------------------------------

def test_request_error_detected_for_pydantic_rejection():
    resp = json.dumps({"error": "1 validation error for MonitoringRequest\ncustomer_id\n  Field required"})
    assert runner._looks_like_request_error(resp)


def test_request_error_ignores_long_real_analyses():
    long_analysis = json.dumps({"summary": "validation error handling reviewed " * 100})
    assert runner._looks_like_request_error(long_analysis) is None


def test_request_error_ignores_non_json_prose():
    assert runner._looks_like_request_error("The validation error rate is low; field required checks pass.") is None


def test_request_error_ignores_rich_json_answers():
    resp = json.dumps({"customer_id": "C1", "risk_assessment": {"score": 82}, "summary": "missing data noted"})
    assert runner._looks_like_request_error(resp) is None


# --- judge output parsing ---------------------------------------------------

def test_parse_judge_json_plain():
    assert runner._parse_judge_json('{"score": 88, "reasoning": "ok"}')["score"] == 88


def test_parse_judge_json_prose_wrapped():
    text = 'Here is my assessment: {"score": 42, "reasoning": "weak"} — hope that helps.'
    assert runner._parse_judge_json(text)["score"] == 42


def test_parse_judge_json_unparseable_scores_zero():
    parsed = runner._parse_judge_json("I think the answer is quite good overall.")
    assert parsed["score"] == 0 and "Unparseable" in parsed["reasoning"]


def test_parse_judge_json_require_key():
    text = '{"recommendations": [{"title": "x"}]} trailing prose'
    assert runner._parse_judge_json(text, require="recommendations")["recommendations"]


# --- aggregation, gates, verdicts (judge-only mode, stubbed judge) ----------

def _fake_client(score_by_rubric):
    """bedrock-runtime stub: returns a fixed score per evaluator name."""
    client = MagicMock()

    def converse(**kwargs):
        user_text = kwargs["messages"][0]["content"][0]["text"]
        score = 95
        for name, s in score_by_rubric.items():
            if f"RUBRIC — {name}" in user_text:
                score = s
                break
        return {"output": {"message": {"content": [{"text": json.dumps({"score": score, "reasoning": "stub"})}]}}}

    client.converse = converse
    return client


def _run(scores, response="A clean, grounded answer.", monkeypatch=None):
    fake = _fake_client(scores)
    orig = runner._judge_client
    runner._judge_client = lambda region: fake
    try:
        return runner.evaluate_cases(
            cases=[{"id": "c1", "input": "q", "expectedBehavior": "a", "agentResponse": response}],
            region="us-east-1",
            evaluator_ids=[e.id for e in runner.EVALUATORS if e.kind == "judge"],
        )
    finally:
        runner._judge_client = orig


def test_all_passing_is_autonomy_eligible():
    out = _run({e.name: 99 for e in runner.EVALUATORS})
    assert out["verdict"] == "autonomy-eligible"
    assert out["hardGatesPassed"] == out["hardGatesTotal"]


def test_hard_gate_failure_blocks_regardless_of_average():
    scores = {e.name: 99 for e in runner.EVALUATORS}
    scores["Hallucination Detection"] = 50  # hard gate below threshold
    out = _run(scores)
    assert out["verdict"] == "blocked"
    assert out["overallScore"] > 80  # high average cannot rescue a hard gate


def test_soft_gate_failure_is_conditional():
    scores = {e.name: 99 for e in runner.EVALUATORS}
    scores["Reasoning Coherence"] = 40  # soft gate
    out = _run(scores)
    assert out["verdict"] == "conditional"


def test_pii_regex_force_fails_even_when_judge_approves():
    # The fixture must stay SSN-SHAPED so PII_PATTERNS' \d{3}-\d{2}-\d{4} still fires.
    # It uses the standard documentation placeholder rather than a realistic-looking
    # value: the secret scanner allowlists this exact string, so the test keeps its
    # teeth without a real-shaped identifier living in a tracked file. Do not add a
    # scanner pragma to restore a realistic value — narrowing the content is the fix.
    out = _run({e.name: 99 for e in runner.EVALUATORS},
               response="Customer SSN is 123-45-6789, everything else fine.")
    pii = next(r for r in out["results"] if r["id"] == "pii-leakage")
    assert not pii["passed"] and pii["score"] <= 50
    assert out["verdict"] == "blocked"


def test_dict_input_sent_as_json_not_python_repr():
    sent = {}

    def invoker(payload):
        sent["payload"] = payload
        return {"response": "ok answer", "latencyMs": 1000.0, "estCostUsd": 0.01}

    fake = _fake_client({})
    orig = runner._judge_client
    runner._judge_client = lambda region: fake
    try:
        runner.evaluate_cases(
            cases=[{"id": "c1", "input": {"customer_id": "C1"}, "expectedBehavior": "a"}],
            region="us-east-1", evaluator_ids=["contextual-grounding"], invoker=invoker,
        )
    finally:
        runner._judge_client = orig
    json.loads(sent["payload"])  # must be valid JSON — str(dict) would raise here


def test_rejected_payload_fails_run_loudly():
    def invoker(payload):
        return {"response": '{"error": "1 validation error for X\\nfield\\n  Field required"}',
                "latencyMs": 500.0, "estCostUsd": 0.001}

    try:
        runner.evaluate_cases(
            cases=[{"id": "c1", "input": "q", "expectedBehavior": "a"}],
            region="us-east-1", evaluator_ids=["contextual-grounding"], invoker=invoker,
        )
        raised = False
    except RuntimeError as exc:
        raised = "rejected the request payload" in str(exc)
    assert raised


# --- store memory-fallback semantics ----------------------------------------

def test_memory_fallback_evicted_after_successful_write():
    service = _load("evaluation_service_ut", "services/evaluation_service.py")
    store = service.EvaluationStore(region="us-east-1", table_name="unit-test")
    calls = {"n": 0}
    table = MagicMock()

    def put_item(Item):
        calls["n"] += 1
        if calls["n"] == 1:
            raise service.ClientError({"Error": {"Code": "Throttling"}}, "PutItem")

    table.put_item = put_item
    store._ddb_ok = True
    store._ddb = lambda: table

    store.save_run({"id": "r1", "status": "running"})     # write 1: DDB fails → memory
    assert store._get("RUN#r1")["status"] == "running"
    store.save_run({"id": "r1", "status": "completed"})   # write 2: DDB succeeds → evict
    table.get_item = MagicMock(return_value={"Item": {"pk": "RUN#r1", "status": "completed"}})
    # memory must no longer shadow DynamoDB
    assert store._get("RUN#r1")["status"] == "completed"


# --- deployment record mapping: all three writers plus degenerate shapes ----

def _routes():
    return _load("evaluations_routes_ut", "api/routes/evaluations.py")


def test_mapping_foundry_script_shape():
    dep = _routes()._map_deployment_item({
        "id": "fraud-detection-langgraph", "name": "Fraud Detection", "framework": "LangGraph",
        "status": "SUCCEEDED", "agent_runtime_arn": "arn:aws:bedrock-agentcore:r:1:runtime/ava_r01_langgraph-x"})
    assert dep["runtimeArn"].endswith("ava_r01_langgraph-x") and dep["name"] == "Fraud Detection"


def test_mapping_deployment_service_shape():
    dep = _routes()._map_deployment_item({
        "deployment_id": "54627ef3", "deployment_name": "Sales Recommend", "framework_id": "strands",
        "template_id": "sales-recommend", "status": "deployed",
        "outputs": {"agent_runtime_arn": "arn:aws:bedrock-agentcore:r:1:runtime/sr-1"}})
    assert dep["runtimeArn"].endswith("sr-1")
    assert dep["name"] == "Sales Recommend" and dep["framework"] == "strands"
    assert dep["templateId"] == "sales-recommend"


def test_mapping_agentcore_runtime_arn_alias():
    dep = _routes()._map_deployment_item({
        "deployment_id": "d2", "deployment_name": "Aliased", "status": "deployed",
        "outputs": {"agentcore_runtime_arn": "arn:aws:bedrock-agentcore:r:1:runtime/alias-1"}})
    assert dep["runtimeArn"].endswith("alias-1")


def test_mapping_web_app_without_runtime_is_flagged():
    dep = _routes()._map_deployment_item({
        "deployment_id": "d3", "deployment_name": "Case Management", "status": "deployed",
        "outputs": {"ui_url": "https://example.cloudfront.net"}})
    assert dep["runtimeArn"] == "" and dep["isWebApp"] is True


def test_mapping_skips_unsuccessful_records():
    assert _routes()._map_deployment_item({"deployment_id": "d4", "status": "failed"}) is None


# --- registry mapping for platform-flow deployments --------------------------

def test_registry_match_by_template_id():
    # Real platform-flow records carry the "foundry-" prefix on template_id —
    # matching must strip it (deployments.py strips it in five places).
    enr = _load("evaluation_enrollment_ut", "services/evaluation_enrollment.py")
    uc = enr._registry_entry_for({"templateId": "foundry-fraud_detection", "runtimeArn": "arn:...:runtime/custom-name-1"})
    assert uc and uc["id"] == "R01"


def test_registry_prefers_exact_match_over_prefix():
    # "Fraud Detection Lite" must not prefix-bind to R01 when another entry
    # matches exactly; with no exact match anywhere prefix binding is allowed
    # (drafts are human-reviewed), but exact always wins first.
    enr = _load("evaluation_enrollment_ut", "services/evaluation_enrollment.py")
    exact = enr._registry_entry_for({"templateId": "foundry-adverse_media", "name": "Fraud Detection Lite"})
    assert exact and exact["id"] == "R05"


def test_registry_unmatched_yields_generic_draft():
    enr = _load("evaluation_enrollment_ut2", "services/evaluation_enrollment.py")
    draft = enr.draft_suite_for_deployment(
        {"deploymentId": "54627ef3", "name": "sales-recommend", "runtimeArn": "arn:...:runtime/custom-1"},
        region="us-east-1")
    assert draft["draft"] is True and "verify input format" in draft["name"]
    assert "placeholders" in draft["cases"][0]["expectedBehavior"]


# --- broadened error-response detection --------------------------------------

def test_request_error_detects_converse_validation_exception_text():
    resp = ("An error occurred (ValidationException) when calling the ConverseStream operation: "
            "The input is missing a user message.")
    assert runner._looks_like_request_error(resp)


def test_request_error_detects_traceback():
    assert runner._looks_like_request_error("Traceback (most recent call last):\n  File x.py ...")


def test_request_error_detects_json_exception_message():
    assert runner._looks_like_request_error(json.dumps(
        {"error": "ValidationException from the ConverseStream operation"}))


def test_request_error_ignores_answer_discussing_exceptions():
    resp = ("The payment pipeline is resilient: when a downstream dependency raises a "
            "ValidationException the orchestrator retries with backoff, and reconciliation "
            "continues from the last checkpoint. Overall risk is low.")
    assert runner._looks_like_request_error(resp) is None


def test_request_error_allows_leading_error_quote_in_long_analysis():
    # A diagnostic agent legitimately LEADS with a quoted AWS error but then
    # analyzes it at length — must not be flagged (length guard).
    resp = ("An error occurred (ValidationException) when calling the ProcessPayment operation: "
            "the sender account was closed. Root cause analysis: " + "the upstream mandate feed lagged. " * 30)
    assert runner._looks_like_request_error(resp) is None


def test_request_error_allows_compliance_vocabulary_in_message_envelope():
    # Bare {"message": ...} could be a minimal legitimate answer envelope;
    # "exception" is everyday compliance vocabulary and must not trip it.
    import json as j
    resp = j.dumps({"message": "The transaction qualifies for the de minimis exception under Reg E; no filing required."})
    assert runner._looks_like_request_error(resp) is None


def test_request_error_still_catches_error_key_exception():
    import json as j
    resp = j.dumps({"error": "Unhandled exception in handler: KeyError('records')"})
    assert runner._looks_like_request_error(resp) is not None


def test_web_app_generic_draft_gives_judge_only_guidance():
    enr = _load("evaluation_enrollment_ut2", "services/evaluation_enrollment.py")
    dep = {"deploymentId": "webapp-1", "name": "Case Management", "isWebApp": True,
           "runtimeArn": "", "templateId": "case-management"}
    suite = enr.draft_suite_for_deployment(dep, "us-east-1")
    case = suite["cases"][0]
    assert "web application" in case["expectedBehavior"]
    assert "agentResponse" not in case  # unedited run must refuse, not judge a placeholder
    assert "recorded outputs" in suite["name"]


def test_mapping_web_app_detects_any_url_output_key():
    routes = _routes()
    item = {"id": "cm-1", "deployment_name": "Case Management", "status": "deployed",
            "outputs": {"cloudfront_url": "https://x.example"}}
    mapped = routes._map_deployment_item(item)
    assert mapped["isWebApp"] is True and mapped["runtimeArn"] == ""


def test_auto_enroll_scaffolds_draft_for_unmatched_deployment(monkeypatch):
    # Zero-click enrollment: a listed deployment with no suite gets a draft in
    # the background (generic path here — no registry match, no LLM call).
    import time as _t
    routes = _routes()

    class MemStore:
        def __init__(self):
            self.suites = {}
        def suites_for_deployment(self, dep_id):
            return [s for s in self.suites.values() if s.get("target_deployment_id") == dep_id]
        def save_suite(self, suite):
            self.suites[suite["id"]] = suite

    store = MemStore()
    monkeypatch.setattr(routes, "get_store", lambda: store)
    routes._auto_enroll_seen.clear()
    dep = {"deploymentId": "zzz-unmatched-9x", "name": "Mystery Agent", "runtimeArn": "arn:x:runtime/whatever",
           "templateId": "", "useCaseId": "", "isWebApp": False}
    routes._auto_enroll_missing([dep])
    for _ in range(50):
        if store.suites:
            break
        _t.sleep(0.1)
    assert store.suites, "auto-enroll thread did not create a draft suite"
    suite = list(store.suites.values())[0]
    assert suite["draft"] is True and suite["target_deployment_id"] == "zzz-unmatched-9x"
    # second sweep must not create another (seen-set)
    routes._auto_enroll_missing([dep])
    _t.sleep(0.3)
    assert len(store.suites) == 1


def test_mapping_camelcase_arn_output_value_scan():
    # agent-safety's CloudFormation writes AgentRuntimeArn (CamelCase) — key
    # names vary per writer, so detection is by ARN value anywhere in outputs.
    routes = _routes()
    dep = routes._map_deployment_item({
        "id": "agent-safety", "deployment_name": "agent-safety", "status": "deployed",
        "outputs": {"AgentRuntimeArn": "arn:aws:bedrock-agentcore:us-east-1:1:runtime/asafe-x",
                    "DashboardUrl": "https://x.example"}})
    assert dep["runtimeArn"].endswith("runtime/asafe-x") and dep["isWebApp"] is False


def test_mapping_no_runtime_is_judge_only_regardless_of_outputs():
    # langfuse-style records (host keys or empty outputs) must get the same
    # judge-only flag as URL-keyed web apps: no ARN means nothing to invoke.
    routes = _routes()
    for outputs in ({}, {"langfuse_host": "https://x"}, {"cloudfront_url": "https://y"}):
        dep = routes._map_deployment_item({"id": "x", "deployment_name": "x",
                                           "status": "deployed", "outputs": outputs})
        assert dep["isWebApp"] is True


def test_stitch_stream_assembles_tokens():
    body = 'data: "That"\n\ndata: "\'s a great"\n\ndata: " answer."\n\n'
    assert runner._stitch_stream(body) == "That's a great answer."


def test_stitch_stream_preserves_error_object_for_detection():
    body = 'data: {"error": "An error occurred (ValidationException) when calling ConverseStream", "error_type": "ValidationException"}\n\n'
    stitched = runner._stitch_stream(body)
    assert runner._looks_like_request_error(stitched) is not None


def test_stitch_stream_leaves_plain_bodies_alone():
    body = '{"summary": "Normal JSON response"}'
    assert runner._stitch_stream(body) == body
