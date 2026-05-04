"""
SAR Reporting Agent — Amazon Bedrock AgentCore

Strands-based agent deployed on AgentCore Runtime that queries flagged
transactions from the fraud detection pipeline and generates SAR
(Suspicious Activity Report) context for FinCEN filing.

Tools:
  - query_flagged_transactions: Pull HOLD_AND_CASE / STEP_UP_REVIEW txns
  - get_subject_profile: Aggregate subject (src) activity summary
  - build_sar_narrative: Generate SAR Part V narrative from reason tags
  - get_sar_filing_fields: Map to FinCEN SAR field structure

Deploy:
  agentcore dev          # local development
  agentcore deploy       # deploy to AgentCore Runtime
  agentcore invoke "Investigate account MJ456 for SAR filing" --stream
"""

import os
import json
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from collections import Counter

import boto3
from boto3.dynamodb.conditions import Attr
from strands import Agent, tool
from strands.hooks import AfterInvocationEvent, HookProvider, HookRegistry, MessageAddedEvent
from strands.models import BedrockModel
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from bedrock_agentcore.memory import MemoryClient

# ---------- App & Config ----------
app = BedrockAgentCoreApp()
log = app.logger

REGION = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
TABLE_TXN_LOGS = os.environ.get("TABLE_TXN_LOGS", "txn_logs")
MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")
MEMORY_ID = os.environ.get("MEMORY_ID", "")

ddb = boto3.resource("dynamodb", region_name=REGION)
logs_table = ddb.Table(TABLE_TXN_LOGS)
memory_client = MemoryClient(region_name=REGION)


# ---------- Reason-tag → SAR category mapping (FinCEN Part V) ----------
TAG_TO_SAR_CATEGORY = {
    "SMURFING": "Structuring / Smurfing",
    "NEAR_REPORTING_THRESHOLD": "Structuring / Smurfing",
    "HIGH_VELOCITY": "Unusual transaction volume",
    "NEW_BENEFICIARY": "Transactions with new / unknown counterparty",
    "LARGE_AMOUNT": "Transactions inconsistent with expected activity",
    "FAN_IN_TO_DST": "Funnel account / Money mule activity",
    "MULE_DESTINATION": "Funnel account / Money mule activity",
    "TIME_ANOMALY": "Unusual time-of-day activity",
    "WEEKEND_ACTIVITY": "Unusual time-of-day activity",
    "GEO_COUNTRY_CHANGE": "Geographic anomaly",
    "GEO_REGION_CHANGE": "Geographic anomaly",
    "GEO_SUDDEN_HOP": "Impossible travel / Geographic anomaly",
    "DEVICE_CHANGE": "Device anomaly",
    "RAPID_DEVICE_CHANGE": "Rapid device switching",
}

TAG_TO_FINCEN_CODE = {
    "SMURFING": "h",
    "NEAR_REPORTING_THRESHOLD": "h",
    "HIGH_VELOCITY": "z",
    "NEW_BENEFICIARY": "z",
    "LARGE_AMOUNT": "z",
    "FAN_IN_TO_DST": "z",
    "MULE_DESTINATION": "z",
    "TIME_ANOMALY": "z",
    "WEEKEND_ACTIVITY": "z",
    "GEO_COUNTRY_CHANGE": "z",
    "GEO_REGION_CHANGE": "z",
    "GEO_SUDDEN_HOP": "z",
    "DEVICE_CHANGE": "z",
    "RAPID_DEVICE_CHANGE": "z",
}


def _decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Not serializable: {type(obj)}")


def _extract_tags(txn: dict) -> list:
    """Extract reason_tags from a transaction log item."""
    resp = txn.get("response", {})
    if isinstance(resp, dict):
        return resp.get("reason_tags", [])
    return txn.get("reason_tags", [])


# ---------- Tool 1: query_flagged_transactions ----------
@tool
def query_flagged_transactions(
    src: str = "",
    dst: str = "",
    decision: str = "",
    days_back: int = 30,
) -> str:
    """Query transaction logs for flagged/suspicious transactions.

    Searches the txn_logs DynamoDB table using GSIs for efficient lookup.
    Returns transactions sorted newest-first with fraud scores, decisions,
    and reason tags.

    Args:
        src: Source account ID to filter by (e.g. 'A700', 'MJ456'). Leave empty for no filter.
        dst: Destination account ID to filter by. Leave empty for no filter.
        decision: Filter by decision type: 'HOLD_AND_CASE', 'STEP_UP_REVIEW', or 'APPROVE'. Leave empty for all.
        days_back: Number of days to look back. Default 30.

    Returns:
        JSON string with count and list of matching transactions including
        txn_id, src, dst, amount, timestamp, fraud_score, decision, and reason_tags.
    """
    cutoff = (datetime.utcnow() - timedelta(days=days_back)).isoformat() + "Z"
    limit = 200

    # Build a FilterExpression from the provided filters
    filter_parts = []
    expr_values = {}
    expr_names = {}

    if src:
        filter_parts.append("#src = :src")
        expr_names["#src"] = "src"
        expr_values[":src"] = src
    if dst:
        filter_parts.append("#dst = :dst")
        expr_names["#dst"] = "dst"
        expr_values[":dst"] = dst
    if decision:
        filter_parts.append("#dec = :dec")
        expr_names["#dec"] = "decision"
        expr_values[":dec"] = decision

    scan_kwargs = {"Limit": limit}
    if filter_parts:
        scan_kwargs["FilterExpression"] = " AND ".join(filter_parts)
        scan_kwargs["ExpressionAttributeNames"] = expr_names
        scan_kwargs["ExpressionAttributeValues"] = expr_values

    # Paginate scan to collect enough results
    items = []
    while True:
        resp = logs_table.scan(**scan_kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp or len(items) >= limit:
            break
        scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    # Post-filter by time window
    filtered = [i for i in items if i.get("timestamp", "") >= cutoff]
    filtered.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    result = {"count": len(filtered), "transactions": filtered[:100]}
    return json.dumps(result, default=_decimal_default)


# ---------- Tool 2: get_subject_profile ----------
@tool
def get_subject_profile(src: str, days_back: int = 90) -> str:
    """Build an aggregated risk profile for a subject (source account).

    Queries all flagged transactions for the given source account and
    computes: total transaction count, total amount, unique destinations,
    reason tag frequency, decision breakdown, geographic diversity, device
    count, and derived risk indicators for SAR context.

    Args:
        src: Source account ID to profile (e.g. 'MJ456', 'A830').
        days_back: Number of days to look back. Default 90.

    Returns:
        JSON string with the full subject profile including activity_window,
        total_transactions, total_amount, decision_breakdown, reason_tag_frequency,
        unique_geos, unique_devices, and risk_indicators.
    """
    raw = json.loads(query_flagged_transactions(src=src, days_back=days_back))
    txns = raw["transactions"]

    if not txns:
        return json.dumps({"src": src, "error": "No transactions found."})

    total_amount = sum(float(t.get("amount", 0)) for t in txns)
    unique_dsts = sorted(set(t.get("dst", "") for t in txns if t.get("dst")))
    timestamps = sorted(t.get("timestamp", "") for t in txns if t.get("timestamp"))
    decisions = Counter(t.get("decision", "UNKNOWN") for t in txns)

    tag_freq = Counter()
    for t in txns:
        for tag in _extract_tags(t):
            tag_freq[tag] += 1

    geos, devices = set(), set()
    for t in txns:
        req = t.get("request", {})
        if isinstance(req, dict):
            if req.get("geo"):
                geos.add(req["geo"])
            if req.get("device_id"):
                devices.add(req["device_id"])

    # Derive risk indicators
    indicators = []
    hold_count = decisions.get("HOLD_AND_CASE", 0)
    if hold_count >= 3:
        indicators.append(f"Multiple HOLD_AND_CASE decisions ({hold_count}) indicate persistent high-risk behavior")
    if tag_freq.get("SMURFING", 0) >= 2:
        indicators.append(f"Repeated structuring/smurfing pattern ({tag_freq['SMURFING']} occurrences)")
    if tag_freq.get("GEO_SUDDEN_HOP", 0) >= 1:
        indicators.append("Impossible travel detected")
    if tag_freq.get("RAPID_DEVICE_CHANGE", 0) >= 2:
        indicators.append(f"Frequent rapid device changes ({tag_freq['RAPID_DEVICE_CHANGE']}x)")
    if tag_freq.get("FAN_IN_TO_DST", 0) >= 1 or tag_freq.get("MULE_DESTINATION", 0) >= 1:
        indicators.append("Destination account shows money mule / funnel characteristics")

    amounts = [float(t.get("amount", 0)) for t in txns]
    near_threshold = [a for a in amounts if 95.0 <= a < 100.0]
    if len(near_threshold) >= 3:
        indicators.append(f"{len(near_threshold)} transactions just below $100 reporting threshold – structuring")

    profile = {
        "src": src,
        "activity_window": {"from": timestamps[0] if timestamps else None, "to": timestamps[-1] if timestamps else None},
        "total_transactions": len(txns),
        "total_amount": round(total_amount, 2),
        "unique_destinations": len(unique_dsts),
        "destinations": unique_dsts[:20],
        "decision_breakdown": dict(decisions),
        "reason_tag_frequency": dict(tag_freq.most_common()),
        "unique_geos": sorted(geos),
        "unique_devices": len(devices),
        "risk_indicators": indicators,
    }
    return json.dumps(profile, default=_decimal_default)


# ---------- Tool 3: build_sar_narrative ----------
@tool
def build_sar_narrative(src: str, days_back: int = 90) -> str:
    """Generate a draft SAR narrative (FinCEN Part V) from the subject's transaction history.

    Queries the subject's flagged transactions, maps reason tags to SAR
    suspicious-activity categories and FinCEN characterization codes, and
    produces structured narrative sections: introduction, suspicious activity
    description, transaction summary, and risk assessment.

    Args:
        src: Source account ID to generate narrative for (e.g. 'MJ456').
        days_back: Number of days to look back. Default 90.

    Returns:
        JSON string with subject_account, filing_period, suspicious_activity_categories,
        fincen_characterization_codes, narrative_sections (introduction,
        suspicious_activity_description, transaction_summary, risk_assessment),
        and supporting_data.
    """
    profile = json.loads(get_subject_profile(src=src, days_back=days_back))
    if "error" in profile:
        return json.dumps(profile)

    raw = json.loads(query_flagged_transactions(src=src, days_back=days_back))
    txns = raw["transactions"]

    all_tags = []
    for t in txns:
        all_tags.extend(_extract_tags(t))

    sar_categories = sorted(set(TAG_TO_SAR_CATEGORY.get(tag, "") for tag in all_tags if tag in TAG_TO_SAR_CATEGORY))
    fincen_codes = sorted(set(TAG_TO_FINCEN_CODE.get(tag, "") for tag in all_tags if tag in TAG_TO_FINCEN_CODE))

    # Build narrative sections
    intro = (
        f"This SAR is being filed regarding suspicious activity involving account {src}. "
        f"Activity spans from {profile['activity_window']['from']} to {profile['activity_window']['to']}. "
        f"{profile['total_transactions']} transactions totaling ${profile['total_amount']:,.2f} were flagged."
    )

    activity_lines = []
    tag_freq = profile.get("reason_tag_frequency", {})
    if "Structuring / Smurfing" in sar_categories:
        activity_lines.append(f"Structuring behavior detected with {tag_freq.get('SMURFING', 0)} instances of transactions below reporting threshold.")
    if "Unusual transaction volume" in sar_categories:
        activity_lines.append(f"High-velocity patterns detected {tag_freq.get('HIGH_VELOCITY', 0)} time(s).")
    if "Funnel account / Money mule activity" in sar_categories:
        activity_lines.append("Destination accounts show fan-in patterns consistent with money mule activity.")
    if any(c for c in sar_categories if "Geographic" in c or "travel" in c.lower()):
        activity_lines.append(f"Geographic anomalies across {len(profile.get('unique_geos', []))} locations: {', '.join(profile.get('unique_geos', []))}.")
    if any(c for c in sar_categories if "Device" in c or "device" in c):
        activity_lines.append(f"Account accessed from {profile.get('unique_devices', 0)} distinct devices with rapid switching.")

    hold_txns = [t for t in txns if t.get("decision") == "HOLD_AND_CASE"]
    review_txns = [t for t in txns if t.get("decision") == "STEP_UP_REVIEW"]
    txn_summary = (
        f"Of {len(txns)} flagged transactions, {len(hold_txns)} were held for case review "
        f"and {len(review_txns)} escalated for step-up review. "
        f"Funds directed to {profile['unique_destinations']} unique destinations."
    )

    result = {
        "subject_account": src,
        "filing_period": profile["activity_window"],
        "suspicious_activity_categories": sar_categories,
        "fincen_characterization_codes": fincen_codes,
        "narrative_sections": {
            "introduction": intro,
            "suspicious_activity_description": " ".join(activity_lines) if activity_lines else "Automated monitoring flagged anomalous transaction patterns.",
            "transaction_summary": txn_summary,
            "risk_assessment": " ".join(profile.get("risk_indicators", [])) or "No additional risk indicators.",
        },
        "supporting_data": {
            "total_suspicious_transactions": profile["total_transactions"],
            "total_suspicious_amount": profile["total_amount"],
            "decision_breakdown": profile["decision_breakdown"],
            "reason_tag_frequency": profile["reason_tag_frequency"],
        },
    }
    return json.dumps(result, default=_decimal_default)


# ---------- Tool 4: get_sar_filing_fields ----------
@tool
def get_sar_filing_fields(src: str, days_back: int = 90) -> str:
    """Generate a complete SAR filing report with all FinCEN fields in a single call.

    Does ONE DynamoDB scan, then builds the full profile, narrative, and
    filing structure. This is the fastest way to produce a SAR report.
    Covers Part I (filing info), Part II (subject), Part III (suspicious
    activity), Part IV (institution placeholder), Part V (narrative),
    and supporting evidence.

    Args:
        src: Source account ID to generate filing for (e.g. 'MJ456').
        days_back: Number of days to look back. Default 90.

    Returns:
        JSON string with the complete SAR filing structure.
    """
    # --- Single scan ---
    cutoff = (datetime.utcnow() - timedelta(days=days_back)).isoformat() + "Z"
    scan_kwargs = {
        "FilterExpression": "#src = :src",
        "ExpressionAttributeNames": {"#src": "src"},
        "ExpressionAttributeValues": {":src": src},
        "Limit": 200,
    }
    items = []
    while True:
        resp = logs_table.scan(**scan_kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp or len(items) >= 200:
            break
        scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    txns = sorted(
        [i for i in items if i.get("timestamp", "") >= cutoff],
        key=lambda x: x.get("timestamp", ""),
        reverse=True,
    )

    if not txns:
        return json.dumps({"error": f"No transactions found for {src}."})

    # --- Build profile ---
    total_amount = sum(float(t.get("amount", 0)) for t in txns)
    unique_dsts = sorted(set(t.get("dst", "") for t in txns if t.get("dst")))
    timestamps = sorted(t.get("timestamp", "") for t in txns if t.get("timestamp"))
    decisions = Counter(t.get("decision", "UNKNOWN") for t in txns)

    tag_freq = Counter()
    for t in txns:
        for tag in _extract_tags(t):
            tag_freq[tag] += 1

    geos, devices = set(), set()
    for t in txns:
        req = t.get("request", {})
        if isinstance(req, dict):
            if req.get("geo"): geos.add(req["geo"])
            if req.get("device_id"): devices.add(req["device_id"])

    # Risk indicators
    indicators = []
    hold_count = decisions.get("HOLD_AND_CASE", 0)
    if hold_count >= 3:
        indicators.append(f"Multiple HOLD_AND_CASE decisions ({hold_count})")
    if tag_freq.get("SMURFING", 0) >= 2:
        indicators.append(f"Repeated structuring/smurfing ({tag_freq['SMURFING']}x)")
    if tag_freq.get("GEO_SUDDEN_HOP", 0) >= 1:
        indicators.append("Impossible travel detected")
    if tag_freq.get("RAPID_DEVICE_CHANGE", 0) >= 2:
        indicators.append(f"Rapid device changes ({tag_freq['RAPID_DEVICE_CHANGE']}x)")
    amounts = [float(t.get("amount", 0)) for t in txns]
    near_thr = [a for a in amounts if 95.0 <= a < 100.0]
    if len(near_thr) >= 3:
        indicators.append(f"{len(near_thr)} transactions below $100 threshold — structuring")

    # --- SAR categories ---
    all_tags = list(tag_freq.keys())
    sar_cats = sorted(set(TAG_TO_SAR_CATEGORY[t] for t in all_tags if t in TAG_TO_SAR_CATEGORY))
    fin_codes = sorted(set(TAG_TO_FINCEN_CODE[t] for t in all_tags if t in TAG_TO_FINCEN_CODE))

    # --- Narrative ---
    activity_lines = []
    if "Structuring / Smurfing" in sar_cats:
        activity_lines.append(f"Structuring: {tag_freq.get('SMURFING', 0)} instances below threshold.")
    if "Unusual transaction volume" in sar_cats:
        activity_lines.append(f"High-velocity: {tag_freq.get('HIGH_VELOCITY', 0)} time(s).")
    if "Funnel account / Money mule activity" in sar_cats:
        activity_lines.append("Fan-in patterns consistent with money mule activity.")
    if any("Geographic" in c or "travel" in c.lower() for c in sar_cats):
        activity_lines.append(f"Geographic anomalies across {len(geos)} locations: {', '.join(sorted(geos))}.")
    if any("Device" in c or "device" in c for c in sar_cats):
        activity_lines.append(f"{len(devices)} distinct devices with rapid switching.")

    hold_txns = [t for t in txns if t.get("decision") == "HOLD_AND_CASE"]
    review_txns = [t for t in txns if t.get("decision") == "STEP_UP_REVIEW"]

    result = {
        "part_i_filing_info": {"type_of_filing": "Initial", "filing_institution_type": "Money Services Business"},
        "part_ii_subject_info": {"subject_account_number": src, "subject_role": "Account holder - sender", "relationship_to_institution": "Customer"},
        "part_iii_suspicious_activity": {
            "date_range_start": timestamps[0] if timestamps else None,
            "date_range_end": timestamps[-1] if timestamps else None,
            "total_amount_involved": round(total_amount, 2),
            "characterization_codes": fin_codes,
            "suspicious_activity_categories": sar_cats,
            "product_instrument_type": "Funds transfer",
        },
        "part_iv_financial_institution": {"note": "Populate with institution details (name, EIN, address, regulator)"},
        "part_v_narrative": {
            "introduction": f"SAR filed for account {src}. Activity: {timestamps[0]} to {timestamps[-1]}. {len(txns)} transactions totaling ${total_amount:,.2f} flagged.",
            "suspicious_activity_description": " ".join(activity_lines) or "Anomalous patterns detected.",
            "transaction_summary": f"Of {len(txns)} flagged, {len(hold_txns)} held for case review, {len(review_txns)} escalated. Funds to {len(unique_dsts)} destinations.",
            "risk_assessment": " ".join(indicators) or "No additional risk indicators.",
        },
        "supporting_evidence": {
            "transaction_count": len(txns),
            "unique_destinations": len(unique_dsts),
            "destinations": unique_dsts[:15],
            "decision_breakdown": dict(decisions),
            "reason_tags": dict(tag_freq.most_common()),
            "risk_indicators": indicators,
            "unique_geos": sorted(geos),
            "unique_devices": len(devices),
        },
    }
    return json.dumps(result, default=_decimal_default)


# ---------- System Prompt ----------
SYSTEM_PROMPT = """You are a SAR (Suspicious Activity Report) analyst assistant for a financial institution's compliance team.

You help compliance officers investigate flagged transactions and prepare SAR filings for FinCEN.

IMPORTANT — when asked to generate a SAR report or filing:
- Call get_sar_filing_fields ONCE. It does everything in a single call (scans transactions, builds profile, generates narrative, maps to FinCEN fields).
- Do NOT call multiple tools sequentially. get_sar_filing_fields is self-contained and fast.
- After receiving the tool result, format it as a readable SAR report with Parts I-V.

For exploratory investigation (not report generation), you may use:
- query_flagged_transactions() for browsing transactions
- get_subject_profile() for a risk overview

Key guidelines:
- Flag structuring patterns (near $100 threshold) prominently — FinCEN priority
- Decision meanings: HOLD_AND_CASE = score >= 0.95, STEP_UP_REVIEW = score >= 0.85
- All SAR narratives are drafts requiring compliance officer review before filing"""

# ---------- Memory Hooks ----------
class SARMemoryHooks(HookProvider):
    """Hooks that retrieve past context before each query and save interactions after."""

    def __init__(self, memory_id: str, client: MemoryClient, actor_id: str, session_id: str):
        self.memory_id = memory_id
        self.client = client
        self.actor_id = actor_id
        self.session_id = session_id
        # Get namespace from memory strategies
        try:
            strategies = self.client.get_memory_strategies(self.memory_id)
            self.namespaces = {s["type"]: s["namespaces"][0] for s in strategies}
        except Exception:
            self.namespaces = {}

    def retrieve_context(self, event: MessageAddedEvent):
        """Before processing, retrieve relevant memories and inject as context."""
        messages = event.agent.messages
        if not messages or messages[-1]["role"] != "user":
            return
        content = messages[-1].get("content", [])
        if not content or "toolResult" in content[0]:
            return
        user_query = content[0].get("text", "")
        if not user_query:
            return

        try:
            all_context = []
            for ctx_type, namespace in self.namespaces.items():
                memories = self.client.retrieve_memories(
                    memory_id=self.memory_id,
                    namespace=namespace.format(actorId=self.actor_id),
                    query=user_query,
                    top_k=5,
                )
                for mem in memories:
                    if isinstance(mem, dict):
                        text = mem.get("content", {}).get("text", "").strip() if isinstance(mem.get("content"), dict) else ""
                        if text:
                            all_context.append(f"[{ctx_type.upper()}] {text}")

            if all_context:
                context_str = "\n".join(all_context)
                messages[-1]["content"][0]["text"] = (
                    f"Previous context from memory:\n{context_str}\n\nCurrent query: {user_query}"
                )
                log.info(f"Injected {len(all_context)} memory items")
        except Exception as e:
            log.error(f"Memory retrieve failed: {e}")

    def save_interaction(self, event: AfterInvocationEvent):
        """After response, save the user/assistant exchange to memory."""
        try:
            messages = event.agent.messages
            if len(messages) < 2 or messages[-1]["role"] != "assistant":
                return
            user_query, agent_response = None, None
            for msg in reversed(messages):
                if msg["role"] == "assistant" and not agent_response:
                    agent_response = msg["content"][0].get("text", "")
                elif msg["role"] == "user" and not user_query and "toolResult" not in msg["content"][0]:
                    user_query = msg["content"][0].get("text", "")
                    break
            if user_query and agent_response:
                self.client.create_event(
                    memory_id=self.memory_id,
                    actor_id=self.actor_id,
                    session_id=self.session_id,
                    messages=[(user_query, "USER"), (agent_response, "ASSISTANT")],
                )
                log.info("Saved interaction to memory")
        except Exception as e:
            log.error(f"Memory save failed: {e}")

    def register_hooks(self, registry: HookRegistry) -> None:
        registry.add_callback(MessageAddedEvent, self.retrieve_context)
        registry.add_callback(AfterInvocationEvent, self.save_interaction)
        log.info("SAR memory hooks registered")


# ---------- Agent Setup ----------
_agent = None


def get_or_create_agent():
    global _agent
    if _agent is None:
        import uuid
        model = BedrockModel(model_id=MODEL_ID, region_name=REGION)
        hooks = []
        if MEMORY_ID:
            memory_hooks = SARMemoryHooks(
                memory_id=MEMORY_ID,
                client=memory_client,
                actor_id="sar_analyst",
                session_id=str(uuid.uuid4()),
            )
            hooks.append(memory_hooks)
        else:
            log.warning("MEMORY_ID not set — running without memory hooks")
        _agent = Agent(
            model=model,
            system_prompt=SYSTEM_PROMPT,
            tools=[
                query_flagged_transactions,
                get_subject_profile,
                build_sar_narrative,
                get_sar_filing_fields,
            ],
            hooks=hooks,
        )
    return _agent


# ---------- AgentCore Runtime Entrypoint ----------
@app.entrypoint
async def invoke(payload, context):
    """AgentCore Runtime entrypoint — receives prompts and returns responses."""
    log.info("SAR Agent invoked")
    agent = get_or_create_agent()
    user_input = payload.get("prompt", "")
    result = agent(user_input)
    yield str(result)


if __name__ == "__main__":
    app.run()
