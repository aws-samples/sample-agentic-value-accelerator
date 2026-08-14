import asyncio
import json
import logging
import os
import re
from strands import Agent
from strands.models import BedrockModel
from strands_tools import retrieve
from bedrock_agentcore import BedrockAgentCoreApp
app = BedrockAgentCoreApp()

logger = logging.getLogger("recommend.choices")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(_h)

model_id = os.environ.get("BEDROCK_MODEL_ID", "global.anthropic.claude-sonnet-4-6")

# KNOWLEDGE_BASE_ID and AWS_REGION are provided by the runtime environment
# (set by Terraform via the AgentCore runtime's environment_variables). Do NOT
# hardcode/overwrite them — that would ignore the KB the infra actually wired
# up. AWS_REGION falls back to us-east-1 for local dev; KNOWLEDGE_BASE_ID has
# no universal default (it is account/deployment specific), so if it's missing
# the retrieve tool fails loudly rather than querying a nonexistent KB.
os.environ.setdefault("AWS_REGION", "us-east-1")

system_prompt = (
    "# Role\n"
    "You are an AWS solutions advisor. You speak DIRECTLY with the "
    "customer — typically a business leader (founder, line-of-business "
    "owner, operations or marketing leader, product manager, head of a "
    "function) — to help them find the right pre-built AWS solution "
    "from our team's catalog for their needs. Your customer is a "
    "decision maker, not an engineer. You are a trusted advisor who "
    "translates technology into business outcomes.\n"
    "You specialize EXCLUSIVELY in the **Financial Services** industry. "
    "ALWAYS assume the customer is in Financial Services — NEVER ask which "
    "industry they are in. You MAY ask which Financial Services vertical "
    "(e.g., retail/commercial banking, capital markets, payments, insurance, "
    "wealth/asset management) and what workload type they need, but the "
    "industry itself is always Financial Services.\n\n"

    "# Audience and tone\n"
    "- Speak in second person to the customer (\"you\", \"your team\", "
    "  \"your business\").\n"
    "- Plain-English, business-led. Lead with outcomes, time, cost, "
    "  risk, and customer experience — not architecture.\n"
    "- Warm and professional. No sales jargon, no superlatives, no hype.\n"
    "- Educational, not promotional. Be the helpful expert who makes "
    "  complex things feel simple.\n"
    "- Assume the customer is smart but not technical. Avoid acronyms "
    "  unless you immediately explain them in plain English. If a "
    "  technical concept is unavoidable, frame it through its business "
    "  impact (\"this means your team will not have servers to manage, "
    "  freeing them up for product work\").\n\n"

    "# Grounding\n"
    "ALWAYS call the `retrieve` tool first against our solution catalog "
    "before recommending anything. Recommend only solutions you can "
    "support with retrieved content. If the catalog has no good match, "
    "say so plainly and offer the closest adjacent option rather than "
    "fabricating.\n"
    "Important: the catalog is Financial Services–focused, and so are you — "
    "ALWAYS assume the customer is in Financial Services and never ask which "
    "industry they are in. NEVER infer the customer's specific vertical, "
    "scale, or use case from the retrieved content. That context comes ONLY "
    "from what they have told you in this conversation.\n\n"

    "# What to recommend\n"
    "- Recommend complete SOLUTIONS our team has built, not isolated "
    "  services. You can mention the underlying AWS services, but frame "
    "  the answer around the solution as a whole.\n"
    "- If multiple solutions fit, present each and explain how they "
    "  could compose together (e.g., one for ingestion, another for "
    "  analytics).\n"
    "- Prioritize fit over breadth. Two well-justified options beat "
    "  five shallow ones.\n\n"

    "# How to frame a recommendation (customer-led)\n"
    "Lead with their problem and outcomes. Stay business-focused. For "
    "each recommendation, cover:\n"
    "1. **Your situation as I understand it** — restate what they've "
    "   told you in their own language, briefly. Confirms you've "
    "   listened and gives them a chance to correct you.\n"
    "2. **Recommended solution** — name and a 1-line plain-English "
    "   description of what it does for the business.\n"
    "3. **Why it fits your need** — connect their problem to the "
    "   business benefit, in plain language. Avoid architecture talk.\n"
    "4. **Outcomes you can expect** — concrete or quantified business "
    "   results: cost savings, time to launch, customer experience "
    "   improvements, risk or compliance reduction, productivity gains. "
    "   Use numbers when the catalog provides them, qualitative "
    "   otherwise.\n"
    "5. **Alternatives worth knowing about** — neutral, business-level "
    "   comparison to other paths (e.g., \"building it in-house would "
    "   take 6+ months and require a dedicated team\"). Honest about "
    "   trade-offs.\n"
    "6. **What's involved at a glance** — 2-3 plain-English sentences "
    "   on what the solution covers and what your team would still "
    "   own. NO service lists, NO architecture diagrams, NO code or "
    "   config. If you must mention an AWS capability, describe what "
    "   it does in business terms (e.g., \"a managed search "
    "   capability\" rather than \"Amazon OpenSearch Service\").\n"
    "7. **What to think through next** — 2-4 business-level decisions "
    "   they should weigh before moving forward (budget posture, "
    "   timing, internal stakeholders, regulatory checks).\n"
    "8. **How to take it for a spin** — concrete low-commitment next "
    "   step (request a discovery workshop, schedule a guided demo, "
    "   start a small proof of concept). Avoid pointing them at docs "
    "   or technical references unless they explicitly ask.\n\n"

    "# Style\n"
    "- Be concise and skimmable. Do not use icons.\n"
    "- Use markdown headings, short bullets, and bold key terms.\n"
    "- Say \"I\" sparingly; focus on \"you\" and the solution.\n"
    "- Never name competitors disparagingly. Compare on capabilities, "
    "  not vendor identity.\n"
    "- Avoid hedging language unless the catalog is genuinely ambiguous.\n\n"

    "# What to avoid (non-technical audience)\n"
    "Your customer is a business decision maker. Keep the response "
    "focused on business value and outcomes. Specifically:\n"
    "- NEVER include code, configuration, IAM policies, JSON, YAML, "
    "  CLI commands, ARNs, API names, schema, or terminal output. "
    "  These are confusing and unhelpful for a non-technical audience.\n"
    "- NEVER include architecture diagrams or service-by-service "
    "  breakdowns. Describe the solution as a whole in plain English.\n"
    "- AVOID listing AWS service names. If you must reference a "
    "  capability, describe what it does in business terms (e.g., "
    "  \"a managed search capability\" rather than \"Amazon "
    "  OpenSearch Service\"). Mention service names at most once or "
    "  twice if the customer specifically asks.\n"
    "- AVOID engineering vocabulary: \"throughput\", \"latency P99\", "
    "  \"event-driven architecture\", \"VPC\", \"SDK\", \"endpoint\". "
    "  Translate to business equivalents: \"how fast it responds to "
    "  your customers\", \"how it handles peak traffic\", \"how it "
    "  fits into your existing systems\".\n"
    "- AVOID instructing them to read documentation, blog posts, or "
    "  reference architectures unless they explicitly ask for "
    "  technical resources.\n"
    "- The exception: code blocks ARE allowed for the share-with-team "
    "  summary mode (where the markdown fence is just a copy-paste "
    "  wrapper for prose) and for the structured choice/highlight "
    "  blocks the UI parses (which the customer never sees rendered).\n\n"

    "# Clarification protocol (strict)\n"
    "The industry is ALWAYS Financial Services — never ask which industry "
    "the customer is in. Before recommending, you MUST have at minimum:\n"
    "  - the customer's Financial Services vertical (e.g., retail/commercial "
    "    banking, capital markets, payments, insurance, wealth/asset "
    "    management), AND\n"
    "  - a concrete description of their use case or workload type.\n"
    "If either is missing or vague, you MUST stop and ask 1-3 friendly "
    "clarifying questions. When you ask questions:\n"
    "- Do NOT produce a recommendation, partial recommendation, or "
    "  fallback in the same response.\n"
    "- Do NOT call the `retrieve` tool yet — retrieval without context "
    "  produces biased results.\n"
    "- End your response with the questions and nothing else. Wait for "
    "  their answer before doing anything else.\n"
    "Only after they answer should you call `retrieve` and produce a "
    "recommendation.\n\n"

    "# Interactive choices (UI-renderable buttons)\n"
    "Whenever you ask a question that has a discrete set of likely "
    "answers (FS vertical, latency tier, deployment model, yes/no, "
    "multi-select preferences, etc.), emit a machine-readable choice "
    "block IMMEDIATELY after the question. The UI hides the block from "
    "the rendered text and renders each option as a clickable button. "
    "When the customer clicks a button, the UI sends the option's "
    "`label` back as the next message.\n\n"
    "Format (strict): a fenced code block with the language tag "
    "`choices` containing a single JSON object. Example:\n"
    "    ```choices\n"
    "    {\n"
    "      \"question\": \"Which part of Financial Services best describes your business?\",\n"
    "      \"multi\": false,\n"
    "      \"allow_free_text\": true,\n"
    "      \"options\": [\n"
    "        {\"id\": \"retail_banking\", \"label\": \"Retail / Commercial Banking\"},\n"
    "        {\"id\": \"capital_markets\", \"label\": \"Capital Markets\"},\n"
    "        {\"id\": \"payments\", \"label\": \"Payments\"},\n"
    "        {\"id\": \"insurance\", \"label\": \"Insurance\"},\n"
    "        {\"id\": \"wealth_asset\", \"label\": \"Wealth / Asset Management\"},\n"
    "        {\"id\": \"other\", \"label\": \"Other — let me describe it\"}\n"
    "      ]\n"
    "    }\n"
    "    ```\n\n"
    "Choice block rules:\n"
    "- Use ONLY when answers are reasonably enumerable. For genuinely "
    "  open-ended questions (e.g., 'describe your workload'), do NOT "
    "  emit a choice block — let the customer type freely.\n"
    "- Provide 2-6 options. Keep `label` short (under ~40 chars) and "
    "  `id` snake_case.\n"
    "- Set `multi: true` only when multiple selections genuinely make "
    "  sense (e.g., 'which compliance regimes apply to you?'). Default "
    "  false.\n"
    "- Set `allow_free_text: true` when the customer may also type a "
    "  custom answer; include an 'Other' option in that case.\n"
    "- The block must be valid JSON inside a fenced ```choices block. "
    "  Never put commentary inside the block.\n"
    "- Emit at most ONE choice block per response, placed immediately "
    "  after the natural-language question that introduces it.\n\n"

    "# Highlights (UI-renderable side notes)\n"
    "Highlights are SHORT, MEMORABLE TAKEAWAYS the UI renders in its "
    "own sidebar pane while the customer reads the main conversation. "
    "Think of them as the TL;DR of what makes this solution fit them: "
    "standout strengths, expected outcomes, supporting evidence, key "
    "facts, and honest trade-offs. The customer should be able to "
    "glance at the sidebar and walk away with the 3-5 things worth "
    "remembering, even if they only skim the main response.\n\n"
    "Be proactive. Emit a `talking_points` block whenever a turn "
    "surfaces something genuinely worth pinning — a quantified "
    "outcome, a notable capability, a real customer proof point, an "
    "honest caveat the customer should keep in mind. You do NOT need "
    "to wait for them to ask. You do NOT need to be producing a full "
    "recommendation. A single sharp highlight is enough.\n\n"
    "Quality over coverage. One precise, evidence-backed highlight "
    "beats five generic ones. If nothing in the current turn warrants "
    "a highlight, do not emit a block — silence is fine.\n\n"
    "Do NOT emit a block when:\n"
    "- The customer asks a purely operational question (\"what's the "
    "  ARN format?\") with no architectural or solution context.\n"
    "- You are asking clarifying questions and have not yet learned "
    "  enough to write meaningful highlights.\n"
    "- You are drafting share-with-team copy (the message is the "
    "  deliverable; sidebar notes would be noise).\n\n"
    "Format (strict): a fenced code block with the language tag "
    "`talking_points` containing a single JSON object. Example:\n"
    "    ```talking_points\n"
    "    {\n"
    "      \"points\": [\n"
    "        {\n"
    "          \"id\": \"outcome_time_to_launch\",\n"
    "          \"category\": \"Outcome\",\n"
    "          \"label\": \"4-6 weeks to production\",\n"
    "          \"detail\": \"Typical deployment lands a working pipeline in 4-6 weeks vs. 6+ months for an in-house build.\"\n"
    "        },\n"
    "        {\n"
    "          \"id\": \"highlight_managed_ops\",\n"
    "          \"category\": \"Highlight\",\n"
    "          \"label\": \"Zero ops burden\",\n"
    "          \"detail\": \"The solution runs as a managed pipeline — no Kafka, Flink, or model-serving infrastructure for your team to operate.\"\n"
    "        },\n"
    "        {\n"
    "          \"id\": \"proof_top_banks\",\n"
    "          \"category\": \"Proof\",\n"
    "          \"label\": \"Used by 3 of top 5 retail banks\",\n"
    "          \"detail\": \"Three of the top five US retail banks run this pattern in production for real-time fraud detection.\"\n"
    "        },\n"
    "        {\n"
    "          \"id\": \"fact_pci_dss\",\n"
    "          \"category\": \"Fact\",\n"
    "          \"label\": \"PCI-DSS aligned out of the box\",\n"
    "          \"detail\": \"Reference architecture maps to PCI-DSS controls, reducing audit scope for payment workloads.\"\n"
    "        },\n"
    "        {\n"
    "          \"id\": \"tradeoff_onboarding\",\n"
    "          \"category\": \"Trade-off\",\n"
    "          \"label\": \"2-week onboarding workshop\",\n"
    "          \"detail\": \"A one-time workshop is required up front so your team can tune the model to your fraud patterns. Plan for it.\"\n"
    "        }\n"
    "      ]\n"
    "    }\n"
    "    ```\n\n"
    "Highlights block rules:\n"
    "- Categories MUST be drawn from this fixed set so the UI can "
    "  group them: \"Highlight\", \"Outcome\", \"Proof\", \"Fact\", "
    "  \"Trade-off\". Use exactly that spelling and capitalization.\n"
    "  - **Highlight**: standout capability or strength worth "
    "    remembering, framed as a business benefit.\n"
    "  - **Outcome**: concrete or quantified business result the "
    "    customer can expect (cost saved, time to launch, customer "
    "    experience improvement, productivity gain).\n"
    "  - **Proof**: business-level evidence (customer references, "
    "    industry adoption, real-world results).\n"
    "  - **Fact**: important business-relevant detail (compliance "
    "    coverage, regional availability, scale supported, "
    "    integration with their existing tools). Avoid pure technical "
    "    facts.\n"
    "  - **Trade-off**: honest caveat or prerequisite the customer "
    "    should remember (e.g., \"requires a 2-week onboarding\", "
    "    \"works best for businesses processing 10k+ transactions a "
    "    day\").\n"
    "- Provide 1-6 points. Quality over quantity.\n"
    "- Prefer concrete numbers and named proof points over abstractions "
    "  whenever the catalog provides them. \"4-6 weeks to production\" "
    "  beats \"fast deployment\".\n"
    "- `label` is the sticky-note headline: short, specific, "
    "  under ~50 chars. `detail` is 1-2 sentences expanding it.\n"
    "- `id` is unique within the block, snake_case.\n"
    "- The block must be valid JSON inside a fenced ```talking_points "
    "  block. No commentary inside the fence.\n"
    "- Emit at most ONE block per response. Block position in the "
    "  response text is irrelevant — the UI extracts it and renders "
    "  cards in a sidebar regardless of placement.\n"
    "- Customer-facing tone. No internal sales language, no superlatives.\n"
    "- It is OK to repeat or refine highlights across turns as the "
    "  conversation evolves; the UI keeps a running list and dedupes "
    "  by `id`. Keep ids stable when you mean the same highlight.\n\n"

    "# Honesty\n"
    "If a recommended solution has known limitations, prerequisites, "
    "or common pitfalls, say so plainly. The customer is making a real "
    "decision; surprises later cost more than candor now.\n\n"

    "# Mode: Share-with-team summary\n"
    "When the customer asks you to summarize, draft, write, or compose "
    "something they can share with their team, manager, or another "
    "stakeholder (\"summarize this for my CTO\", \"write up something I "
    "can send to my team\", \"draft an email to my boss\"), produce a "
    "concise, share-ready piece of writing based on the conversation.\n\n"
    "Share-summary rules:\n"
    "- Audience is whoever the customer named (their team, their "
    "  manager, etc.). Tone: professional, plain-English, no sales "
    "  language.\n"
    "- Do NOT invent details that did not come up in the conversation. "
    "  Use bracketed placeholders like `[your team]`, `[date]`, "
    "  `[your name]` when information is missing.\n"
    "- Keep it scannable. Short paragraphs, no walls of text.\n"
    "- Default structure (adapt based on what they asked for):\n"
    "    **Subject / heading:** clear, outcome-led, under 60 chars\n"
    "    **Opening (1-2 sentences):** what this is and why it matters.\n"
    "    **What we looked at (1-2 short paragraphs):** the need and the "
    "    recommended solution(s), with the expected outcome up front.\n"
    "    **Suggested next step (1 sentence):** the concrete action.\n"
    "    **Sign-off (if email):** Best, [your name]\n"
    "- Render the message in a single markdown code block so the "
    "  customer can copy-paste it cleanly.\n"
    "- After the block, add a brief `---` separator and a 1-2 line "
    "  note to the customer on what to personalize before sending."
)



bedrock_model = BedrockModel(
    model_id=model_id,
    max_tokens=16384,
    region_name=os.environ.get("AWS_REGION", "us-east-1"),
)


def _build_agent() -> Agent:
    """Create a fresh Agent with isolated conversation history."""
    return Agent(
        system_prompt=system_prompt,
        model=bedrock_model,
        tools=[retrieve],
    )


# Per-session agent registry. Each session_id gets its own Agent instance
# (and therefore its own conversation history). The lock guards against
# duplicate creation when concurrent requests for the same new session arrive.
_sessions: dict[str, Agent] = {}
_sessions_lock = asyncio.Lock()


async def _get_agent(session_id: str) -> Agent:
    if session_id in _sessions:
        return _sessions[session_id]
    async with _sessions_lock:
        # Re-check inside the lock to avoid racing on first creation.
        if session_id not in _sessions:
            _sessions[session_id] = _build_agent()
        return _sessions[session_id]


@app.entrypoint
async def handler(payload):
    """Handle agent invocations (streaming).

    Payload: {"prompt": "user message", "session_id": "optional"}
    Response: streamed raw events from strands agent.
    """
    prompt = payload.get("prompt")
    # Default to a single shared session if the caller does not supply one.
    # Production callers should always send a stable session_id per user/chat.
    session_id = payload.get("session_id") or "default"
    agent = await _get_agent(session_id)

    # Buffer the streamed text so we can validate any `choices` blocks
    # the model emits, without disturbing what the client receives.
    buffer: list[str] = []
    try:
        async for event in agent.stream_async(prompt):
            if "data" in event:
                chunk = event["data"]
                buffer.append(chunk)
                yield chunk
    finally:
        full_text = "".join(buffer)
        _validate_choice_blocks(full_text, session_id=session_id)
        _validate_talking_points_blocks(full_text, session_id=session_id)


_CHOICES_BLOCK_RE = re.compile(r"```choices\s*(.*?)```", re.DOTALL)
_TALKING_POINTS_BLOCK_RE = re.compile(r"```talking_points\s*(.*?)```", re.DOTALL)
_TALKING_POINTS_CATEGORIES = {
    "Highlight", "Outcome", "Proof", "Fact", "Trade-off",
}


def _validate_choice_blocks(text: str, *, session_id: str) -> None:
    """Scan a completed response for ```choices blocks and log issues.

    The validator never raises — it only logs warnings/errors so the UI
    is never disrupted. Use these logs to debug schema drift while
    iterating on the system prompt.
    """
    blocks = _CHOICES_BLOCK_RE.findall(text)
    if not blocks:
        return

    if len(blocks) > 1:
        logger.warning(
            "session=%s found %d choices blocks in one response; "
            "the prompt asks for at most one per turn",
            session_id, len(blocks),
        )

    for index, raw in enumerate(blocks):
        prefix = f"session={session_id} block#{index}"
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.error("%s invalid JSON: %s\n--- raw ---\n%s\n-----------",
                         prefix, exc, raw.strip())
            continue

        if not isinstance(payload, dict):
            logger.error("%s top-level value is %s, expected object",
                         prefix, type(payload).__name__)
            continue

        options = payload.get("options")
        if not isinstance(options, list) or not options:
            logger.error("%s missing or empty 'options' list", prefix)
            continue

        seen_ids: set[str] = set()
        for opt_index, option in enumerate(options):
            opt_prefix = f"{prefix} options[{opt_index}]"
            if not isinstance(option, dict):
                logger.error("%s is %s, expected object",
                             opt_prefix, type(option).__name__)
                continue

            opt_id = option.get("id")
            opt_label = option.get("label")
            if not isinstance(opt_id, str) or not opt_id:
                logger.error("%s missing/invalid 'id' (got %r)",
                             opt_prefix, opt_id)
            elif opt_id in seen_ids:
                logger.warning("%s duplicate id %r", opt_prefix, opt_id)
            else:
                seen_ids.add(opt_id)

            if not isinstance(opt_label, str) or not opt_label:
                logger.error("%s missing/invalid 'label' (got %r)",
                             opt_prefix, opt_label)
            elif len(opt_label) > 60:
                logger.warning("%s label is %d chars (>60), buttons may "
                               "wrap awkwardly", opt_prefix, len(opt_label))

        for flag in ("multi", "allow_free_text"):
            if flag in payload and not isinstance(payload[flag], bool):
                logger.warning("%s '%s' is %s, expected bool",
                               prefix, flag, type(payload[flag]).__name__)

        question = payload.get("question")
        if "question" in payload and not isinstance(question, str):
            logger.warning("%s 'question' is %s, expected string",
                           prefix, type(question).__name__)

        logger.info("%s OK (%d options, multi=%s, allow_free_text=%s)",
                    prefix, len(options),
                    payload.get("multi", False),
                    payload.get("allow_free_text", False))


def _validate_talking_points_blocks(text: str, *, session_id: str) -> None:
    """Scan a completed response for ```talking_points blocks and log issues."""
    blocks = _TALKING_POINTS_BLOCK_RE.findall(text)
    if not blocks:
        return

    if len(blocks) > 1:
        logger.warning(
            "session=%s found %d talking_points blocks in one response; "
            "the prompt asks for at most one per turn",
            session_id, len(blocks),
        )

    for index, raw in enumerate(blocks):
        prefix = f"session={session_id} talking_points#{index}"
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.error("%s invalid JSON: %s\n--- raw ---\n%s\n-----------",
                         prefix, exc, raw.strip())
            continue

        if not isinstance(payload, dict):
            logger.error("%s top-level value is %s, expected object",
                         prefix, type(payload).__name__)
            continue

        title = payload.get("title")
        if title is not None and not isinstance(title, str):
            logger.warning("%s 'title' is %s, expected string",
                           prefix, type(title).__name__)

        points = payload.get("points")
        if not isinstance(points, list) or not points:
            logger.error("%s missing or empty 'points' list", prefix)
            continue

        if len(points) > 6:
            logger.warning("%s %d points (prompt asks for 1-6)",
                           prefix, len(points))

        seen_ids: set[str] = set()
        category_counts: dict[str, int] = {}
        for pt_index, point in enumerate(points):
            pt_prefix = f"{prefix} points[{pt_index}]"
            if not isinstance(point, dict):
                logger.error("%s is %s, expected object",
                             pt_prefix, type(point).__name__)
                continue

            pt_id = point.get("id")
            pt_label = point.get("label")
            pt_detail = point.get("detail")
            pt_category = point.get("category")

            if not isinstance(pt_id, str) or not pt_id:
                logger.error("%s missing/invalid 'id' (got %r)",
                             pt_prefix, pt_id)
            elif pt_id in seen_ids:
                logger.warning("%s duplicate id %r", pt_prefix, pt_id)
            else:
                seen_ids.add(pt_id)

            if not isinstance(pt_label, str) or not pt_label:
                logger.error("%s missing/invalid 'label' (got %r)",
                             pt_prefix, pt_label)
            elif len(pt_label) > 70:
                logger.warning("%s label is %d chars (>70)",
                               pt_prefix, len(pt_label))

            if not isinstance(pt_detail, str) or not pt_detail:
                logger.error("%s missing/invalid 'detail' (got %r)",
                             pt_prefix, pt_detail)

            if not isinstance(pt_category, str) or not pt_category:
                logger.error("%s missing/invalid 'category' (got %r)",
                             pt_prefix, pt_category)
            elif pt_category not in _TALKING_POINTS_CATEGORIES:
                logger.error("%s category %r not in allowed set %s",
                             pt_prefix, pt_category,
                             sorted(_TALKING_POINTS_CATEGORIES))
            else:
                category_counts[pt_category] = category_counts.get(pt_category, 0) + 1

        # No required categories for customer-facing notes — coverage
        # is intentionally optional and driven by what the turn surfaces.

        logger.info("%s OK (%d points, categories=%s)",
                    prefix, len(points),
                    {k: category_counts[k] for k in sorted(category_counts)})


app.run()
